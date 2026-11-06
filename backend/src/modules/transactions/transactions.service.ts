import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  RecurringStatus,
  Transaction,
  TransactionType,
} from '@prisma/client';
import {
  DomainEvents,
  TransactionChangedEvent,
  TransactionCreatedEvent,
} from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { accountScope } from '../account-access/account-access';
import { AccountAccessService } from '../account-access/account-access.service';
import { CategoriesService } from '../categories/categories.service';
import { LedgerService } from '../ledger/ledger.service';
import {
  CreateTransactionCommand,
  UpdateTransactionCommand,
} from './dto/transactions.dto';
import { computeNextOccurrence, isPastEndDate } from './recurrence';
import { TRANSACTION_INCLUDE } from './transaction-include';
import {
  accountIdsOf,
  isOneSidedTransfer,
  presentTransaction,
} from './transaction-view';

type Db = Prisma.TransactionClient;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly categoriesService: CategoriesService,
    private readonly events: EventEmitter2,
    private readonly access: AccountAccessService,
  ) {}

  /**
   * Pass `db` to join a larger transaction (e.g. the cron advancing a cursor); the caller then owns
   * the boundary and emits TransactionCreated after it commits.
   */
  async create(userId: string, command: CreateTransactionCommand, db?: Db) {
    this.validateCommand(command);
    // The checks read through the caller's transaction too, so a caller that
    // created the account or category earlier in that transaction can see it.
    const reader = db ?? this.prisma;
    const { ledgerUserId, entries } =
      await this.ledgerService.buildEntriesForCommand(userId, command, reader);
    await this.assertCategories(ledgerUserId, command, reader);

    const firstNextOccurrenceAt = command.isRecurring
      ? computeNextOccurrence(
          command.occurredAt.getUTCDate(),
          command.occurredAt,
          command.recurringInterval!,
        )
      : null;
    // The root itself is always posted; if the end date already excludes the
    // next occurrence there's nothing left to generate, so it starts ended.
    const endedAtCreate = firstNextOccurrenceAt
      ? isPastEndDate(firstNextOccurrenceAt, command.recurringEndDate)
      : false;

    const run = async (db: Db) => {
      const created = await db.transaction.create({
        data: {
          userId: ledgerUserId,
          createdById:
            command.createdById === undefined ? userId : command.createdById,
          draftId: command.draftId,
          type: command.type,
          description: command.description,
          currency: command.currency,
          categoryId: command.categoryId,
          occurredAt: command.occurredAt,
          parentTransactionId: command.parentTransactionId,
          ...(command.isRecurring
            ? {
                isRecurring: true,
                recurringInterval: command.recurringInterval,
                recurringStatus: endedAtCreate
                  ? RecurringStatus.CANCELLED
                  : RecurringStatus.ACTIVE,
                recurringEndDate: command.recurringEndDate,
                recurringAmount: new Prisma.Decimal(command.amount),
                recurringFromAccountId: command.fromAccountId,
                recurringToAccountId: command.toAccountId,
                nextOccurrenceAt: endedAtCreate ? null : firstNextOccurrenceAt,
              }
            : {}),
        },
      });

      await this.ledgerService.createEntries(
        db,
        ledgerUserId,
        created.id,
        entries,
      );
      return db.transaction.findUniqueOrThrow({
        where: { id: created.id },
        include: TRANSACTION_INCLUDE,
      });
    };

    const transaction = db
      ? await run(db)
      : await this.prisma.$transaction(run);

    if (!db) this.announceCreated(transaction);

    return transaction;
  }

  /**
   * create() calls it itself; a caller that passed `db` calls it once its own transaction has
   * committed.
   */
  announceCreated(
    transaction: Pick<Transaction, 'id' | 'userId' | 'occurredAt'> & {
      items: { accountId: string }[];
    },
  ) {
    this.events.emit(DomainEvents.TransactionCreated, {
      transactionId: transaction.id,
      userId: transaction.userId,
      occurredAt: transaction.occurredAt,
      accountIds: [...new Set(transaction.items.map((i) => i.accountId))],
    } satisfies TransactionCreatedEvent);
  }

  private async assertCategories(
    ledgerUserId: string,
    command: CreateTransactionCommand | UpdateTransactionCommand,
    db: Db,
  ) {
    await this.categoriesService.assertAssignable(
      ledgerUserId,
      command.type,
      command.categoryId,
      db,
    );
    for (const item of command.items ?? []) {
      await this.categoriesService.assertAssignable(
        ledgerUserId,
        command.type,
        item.categoryId,
        db,
      );
    }
  }

  async getById(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        id,
        deletedAt: null,
        items: { some: { account: accountScope(userId, 'view') } },
      },
      include: TRANSACTION_INCLUDE,
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return presentTransaction(
      transaction,
      await this.access.rolesOn(userId, accountIdsOf(transaction)),
    );
  }

  /**
   * Rewrites in place with create's validation, swapping lines in one transaction so balances move
   * by the difference. A recurring root keeps its type and currency.
   */
  async update(userId: string, id: string, command: UpdateTransactionCommand) {
    const existing = await this.findChangeable(userId, id);
    if (existing.isRecurring && !existing.parentTransactionId) {
      if (command.type !== existing.type) {
        throw new BadRequestException(
          "A recurring series can't change type; delete it and create a new one",
        );
      }
      if (command.currency !== existing.currency) {
        throw new BadRequestException(
          "A recurring series can't change currency; delete it and create a new one",
        );
      }
      // Same rule as create: a recurring transaction is never split.
      if ((command.items?.length ?? 0) > 1) {
        throw new BadRequestException(
          "A recurring transaction can't be split into items",
        );
      }
    }

    this.validateCommand(command);

    const updated = await this.prisma.$transaction(async (db) => {
      // Checked inside the write's own transaction, as create() does, so the
      // gap between the check and the write is one transaction, not a request.
      const { ledgerUserId, entries } =
        await this.ledgerService.buildEntriesForCommand(userId, command, db);
      await this.assertCategories(ledgerUserId, command, db);
      // A series keeps posting to its own ledger, so its root can't leave it.
      if (ledgerUserId !== existing.userId && existing.isRecurring) {
        throw new BadRequestException(
          "A recurring transaction can't move to an account with a different owner",
        );
      }
      // Conditional on deletedAt so a delete racing this edit wins cleanly instead of being undone.
      const claimed = await db.transaction.updateMany({
        where: { id, deletedAt: null },
        data: {
          userId: ledgerUserId,
          updatedById: userId,
          type: command.type,
          description: command.description,
          currency: command.currency,
          categoryId: command.categoryId ?? null,
          occurredAt: command.occurredAt,
        },
      });
      if (claimed.count === 0)
        throw new NotFoundException('Transaction not found');
      await db.transactionItem.deleteMany({ where: { transactionId: id } });
      await this.ledgerService.createEntries(db, ledgerUserId, id, entries);
      return db.transaction.findUniqueOrThrow({
        where: { id },
        include: TRANSACTION_INCLUDE,
      });
    });

    // Cached summaries are per month: the month it left and the month it moved to both changed.
    const accountIds = [
      ...new Set([...accountIdsOf(existing), ...accountIdsOf(updated)]),
    ];
    this.emitChanged(
      updated.userId,
      id,
      accountIds,
      existing.occurredAt,
      updated.occurredAt,
    );
    return presentTransaction(
      updated,
      await this.access.rolesOn(userId, accountIdsOf(updated)),
    );
  }

  /**
   * Rows stay so it can be restored, but it leaves every balance, report, goal and list. Deleting a
   * series root stops the series; generated occurrences stay.
   */
  async remove(userId: string, id: string) {
    const existing = await this.findChangeable(userId, id);
    const claimed = await this.prisma.transaction.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    if (claimed.count === 0)
      throw new NotFoundException('Transaction not found');
    this.emitChanged(
      existing.userId,
      id,
      accountIdsOf(existing),
      existing.occurredAt,
    );
  }

  async restore(userId: string, id: string) {
    await this.assertChangeable(userId, id);
    const claimed = await this.prisma.transaction.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null, updatedById: userId },
    });
    if (claimed.count === 0)
      throw new NotFoundException('Deleted transaction not found');
    const restored = await this.getById(userId, id);
    const { userId: ledgerUserId, occurredAt } =
      await this.prisma.transaction.findUniqueOrThrow({ where: { id } });
    this.emitChanged(
      ledgerUserId,
      id,
      restored.items.map((item) => item.accountId),
      occurredAt,
    );
    return restored;
  }

  /**
   * `transact` on every account it touches; no access is the 404 of a missing id. A one-sided
   * transfer records money that moved with its other half on another ledger, so it stays as it is.
   */
  private async assertChangeable(userId: string, id: string) {
    await this.access.assertTransactionAccess(userId, id, 'transact');
    const { type, _count } = await this.prisma.transaction.findUniqueOrThrow({
      where: { id },
      select: { type: true, _count: { select: { items: true } } },
    });
    if (isOneSidedTransfer({ type, items: Array(_count.items) })) {
      throw new BadRequestException(
        "This is one side of a transfer from before the account changed owner, so it can't be changed.",
      );
    }
  }

  private async findChangeable(userId: string, id: string) {
    await this.assertChangeable(userId, id);
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, deletedAt: null },
      include: { items: { select: { accountId: true } } },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private emitChanged(
    userId: string,
    transactionId: string,
    accountIds: string[],
    ...months: Date[]
  ) {
    const seen = new Set<string>();
    for (const occurredAt of months) {
      const month = `${occurredAt.getUTCFullYear()}-${occurredAt.getUTCMonth()}`;
      if (seen.has(month)) continue;
      seen.add(month);
      this.events.emit(DomainEvents.TransactionChanged, {
        transactionId,
        userId,
        occurredAt,
        accountIds,
      } satisfies TransactionChangedEvent);
    }
  }

  private validateCommand(
    command: CreateTransactionCommand | UpdateTransactionCommand,
  ) {
    if ('isRecurring' in command && command.isRecurring) {
      if (command.items?.length) {
        throw new BadRequestException(
          'Recurring transactions cannot use split items',
        );
      }
      if (!command.recurringInterval) {
        throw new BadRequestException(
          'Recurring transactions require recurringInterval',
        );
      }
      if (
        command.recurringEndDate &&
        command.recurringEndDate <= command.occurredAt
      ) {
        throw new BadRequestException(
          'recurringEndDate must be after occurredAt',
        );
      }
    }
    if (new Prisma.Decimal(command.amount).lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (command.type === TransactionType.INCOME && !command.toAccountId) {
      throw new BadRequestException('Income requires toAccountId');
    }
    if (command.type === TransactionType.EXPENSE && !command.fromAccountId) {
      throw new BadRequestException('Expense requires fromAccountId');
    }
    if (
      command.type === TransactionType.TRANSFER &&
      (!command.fromAccountId || !command.toAccountId)
    ) {
      throw new BadRequestException(
        'Transfer requires fromAccountId and toAccountId',
      );
    }
    if (
      command.type === TransactionType.TRANSFER &&
      command.fromAccountId === command.toAccountId
    ) {
      throw new BadRequestException('Transfer accounts must be different');
    }
    if (command.items?.length) {
      if (command.type === TransactionType.TRANSFER) {
        throw new BadRequestException(
          'Transfers cannot be split into multiple items',
        );
      }
      // A split's categories live on its lines; a top-level one would give analytics, search and
      // the list a second, conflicting answer. A single item may have one.
      if (command.items.length > 1 && command.categoryId) {
        throw new BadRequestException(
          'A split transaction cannot have its own category; set a category on each split line instead',
        );
      }
      for (const item of command.items) {
        if (new Prisma.Decimal(item.amount).lessThanOrEqualTo(0)) {
          throw new BadRequestException(
            'Each split item amount must be greater than zero',
          );
        }
      }
      const itemsTotal = command.items.reduce(
        (sum, item) => sum.plus(item.amount),
        new Prisma.Decimal(0),
      );
      if (!itemsTotal.equals(new Prisma.Decimal(command.amount))) {
        throw new BadRequestException(
          'Split item amounts must add up to the transaction total',
        );
      }
    }
  }
}
