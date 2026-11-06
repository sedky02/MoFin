import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AccountMemberRole,
  Prisma,
  RecurringStatus,
  TransactionType,
} from '@prisma/client';
import {
  AccountAccessChangedEvent,
  DomainEvents,
} from '../../common/events/domain-events';
import { escapeHtml } from '../../common/utils/escape-html';
import { PrismaService } from '../../database/prisma.service';
import { AccountAccessService } from '../account-access/account-access.service';
import { MailSender } from '../mail/mail-sender';

type Db = Prisma.TransactionClient;

/** Long enough for an account with years of history; the default is 5 seconds. */
const HANDOVER_TIMEOUT_MS = 60_000;

export const SERIES_SPLIT_REASON =
  'One of its accounts now has a different owner. Choose another account to resume it.';

/**
 * Passes an account to one of its members. The old owner stays on as an editor
 * and can leave. Ledger rows belong to the account's owner, so the whole account
 * moves in one database transaction, and balances come out exactly as they went
 * in: no amount changes, and no ledger line is added or removed.
 */
@Injectable()
export class OwnershipService {
  private readonly logger = new Logger(OwnershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
    private readonly mail: MailSender,
    private readonly events: EventEmitter2,
  ) {}

  async transfer(userId: string, accountId: string, newOwnerId: string) {
    const accountName = await this.prisma.$transaction(
      async (db) => {
        const { account } = await this.access.assertAccess(
          userId,
          accountId,
          'manage',
          { db },
        );
        const member = await db.accountMember.findUnique({
          where: { accountId_userId: { accountId, userId: newOwnerId } },
        });
        if (!member) throw new NotFoundException('Member not found');

        // Conditional, and it locks the row: of two concurrent handovers one
        // waits here, then finds the owner changed and stops.
        const { hideAmount: ownerHid, ...metadata } =
          account.metadata as Record<string, unknown>;
        const { count } = await db.account.updateMany({
          where: { id: accountId, userId },
          data: {
            userId: newOwnerId,
            metadata: (member.hideAmount
              ? { ...metadata, hideAmount: true }
              : metadata) as Prisma.InputJsonValue,
          },
        });
        if (count !== 1)
          throw new ConflictException('This account has just changed owner.');

        await this.splitTransfersAcrossOwners(db, accountId, newOwnerId);
        await this.detachSeriesAcrossOwners(db, accountId);
        await this.moveCategories(db, accountId, newOwnerId);

        // Everything on the account now touches this account alone.
        await db.transaction.updateMany({
          where: { items: { some: { accountId } } },
          data: { userId: newOwnerId },
        });
        await db.transactionItem.updateMany({
          where: { accountId },
          data: { userId: newOwnerId },
        });
        await db.goal.updateMany({
          where: { accountId },
          data: { userId: newOwnerId },
        });

        await db.accountMember.delete({ where: { id: member.id } });
        await db.accountMember.create({
          data: {
            accountId,
            userId,
            role: AccountMemberRole.EDITOR,
            hideAmount: ownerHid === true,
          },
        });
        await db.accountInvitation.updateMany({
          where: { accountId, status: 'PENDING' },
          data: { invitedById: newOwnerId },
        });
        return account.name;
      },
      { timeout: HANDOVER_TIMEOUT_MS },
    );

    this.events.emit(DomainEvents.AccountAccessChanged, {
      userIds: await this.access.usersWithAccess([accountId]),
    } satisfies AccountAccessChangedEvent);
    await this.notify(newOwnerId, accountName);
  }

  /**
   * A past transfer between this account and another of the old owner's would
   * now span two ledgers. Each side keeps its own record instead: this
   * account's legs move to a new one-sided transaction, unchanged, so both
   * balances stay exact and deleting either person's data can't touch the
   * other's. One-sided transfers can't be edited (see TransactionsService).
   */
  private async splitTransfersAcrossOwners(
    db: Db,
    accountId: string,
    newOwnerId: string,
  ) {
    const spanning = await db.transaction.findMany({
      where: {
        AND: [
          { items: { some: { accountId } } },
          { items: { some: { accountId: { not: accountId } } } },
        ],
      },
    });
    for (const original of spanning) {
      const side = await db.transaction.create({
        data: {
          userId: newOwnerId,
          createdById: original.createdById,
          updatedById: original.updatedById,
          type: TransactionType.TRANSFER,
          description: original.description,
          currency: original.currency,
          occurredAt: original.occurredAt,
          deletedAt: original.deletedAt,
        },
      });
      await db.transactionItem.updateMany({
        where: { transactionId: original.id, accountId },
        data: { transactionId: side.id },
      });
    }
  }

  /**
   * A series goes with its root's ledger legs, and it may only post within the
   * ledger it ends up on. It can also point somewhere its root's legs aren't:
   * editing a series changes only its template. So any account on the wrong side
   * of the handover is cleared, because a pointer to an account its owner no
   * longer holds would block deleting that account later, and the series pauses
   * until an edit gives it a new one.
   */
  private async detachSeriesAcrossOwners(db: Db, accountId: string) {
    const roots = await db.transaction.findMany({
      where: {
        isRecurring: true,
        OR: [
          { items: { some: { accountId } } },
          { recurringFromAccountId: accountId },
          { recurringToAccountId: accountId },
        ],
      },
      include: { items: { select: { accountId: true } } },
    });
    for (const root of roots) {
      const moves = root.items.some((item) => item.accountId === accountId);
      const kept = (id: string | null) =>
        id !== null && (id === accountId) === moves ? id : null;
      const from = kept(root.recurringFromAccountId);
      const to = kept(root.recurringToAccountId);
      if (
        from === root.recurringFromAccountId &&
        to === root.recurringToAccountId
      ) {
        continue;
      }
      await db.transaction.update({
        where: { id: root.id },
        data: {
          recurringFromAccountId: from,
          recurringToAccountId: to,
          ...(root.recurringStatus === RecurringStatus.ACTIVE
            ? {
                recurringStatus: RecurringStatus.PAUSED,
                recurringError: SERIES_SPLIT_REASON,
                lastFailedAt: new Date(),
              }
            : {}),
        },
      });
    }
  }

  /**
   * A shared account uses its owner's categories, so what's filed on this one
   * moves to the new owner's: their own of the same name and type where they
   * have one, otherwise a copy. Global categories belong to nobody and stay.
   */
  private async moveCategories(db: Db, accountId: string, newOwnerId: string) {
    const onAccount = { items: { some: { accountId } } };
    const [fromTransactions, fromItems] = [
      await db.transaction.findMany({
        where: { ...onAccount, categoryId: { not: null } },
        select: { categoryId: true },
        distinct: ['categoryId'],
      }),
      await db.transactionItem.findMany({
        where: { accountId, categoryId: { not: null } },
        select: { categoryId: true },
        distinct: ['categoryId'],
      }),
    ];
    const ids = [
      ...new Set(
        [...fromTransactions, ...fromItems].map((row) => row.categoryId!),
      ),
    ];
    const toMove = await db.category.findMany({
      where: {
        id: { in: ids },
        userId: { not: null },
        NOT: { userId: newOwnerId },
      },
    });

    for (const category of toMove) {
      const { name, type, color, icon, archivedAt } = category;
      const target = await db.category.upsert({
        where: { userId_name_type: { userId: newOwnerId, name, type } },
        create: { userId: newOwnerId, name, type, color, icon, archivedAt },
        update: {},
      });
      await db.transaction.updateMany({
        where: { ...onAccount, categoryId: category.id },
        data: { categoryId: target.id },
      });
      await db.transactionItem.updateMany({
        where: { accountId, categoryId: category.id },
        data: { categoryId: target.id },
      });
    }
  }

  /** A courtesy: the handover has already happened, so a failed send only gets logged. */
  private async notify(newOwnerId: string, accountName: string) {
    try {
      const { email } = await this.prisma.user.findUniqueOrThrow({
        where: { id: newOwnerId },
        select: { email: true },
      });
      await this.mail.send({
        to: email,
        subject: 'You now own an account on MoFin',
        text: `You are now the owner of the account "${accountName}" on MoFin. You can manage its members in the app.`,
        html: `<p>You are now the owner of the account "${escapeHtml(accountName)}" on MoFin. You can manage its members in the app.</p>`,
      });
    } catch (error) {
      this.logger.warn(
        `Ownership notice not sent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
