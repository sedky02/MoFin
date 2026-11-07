import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountMemberRole, Prisma } from '@prisma/client';
import {
  AccountAccessChangedEvent,
  DomainEvents,
} from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { AccountRole } from '../account-access/account-access';
import { AccountAccessService } from '../account-access/account-access.service';
import {
  AccountVisibility,
  withVisibility,
} from '../accounts/account-visibility';

const notFound = () => new NotFoundException('Member not found');

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
    private readonly events: EventEmitter2,
  ) {}

  /** Owner first. Addresses show only to the owner and on your own row. */
  async list(userId: string, accountId: string) {
    const { role } = await this.access.assertAccess(userId, accountId, 'view');
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        createdAt: true,
        user: { select: { id: true, displayName: true, email: true } },
        members: {
          orderBy: { createdAt: 'asc' },
          select: {
            role: true,
            createdAt: true,
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
    });
    const row = (
      person: { id: string; displayName: string | null; email: string },
      memberRole: AccountRole,
      joinedAt: Date,
    ) => ({
      userId: person.id,
      displayName: person.displayName,
      email: role === 'OWNER' || person.id === userId ? person.email : null,
      role: memberRole,
      isYou: person.id === userId,
      joinedAt,
    });
    return [
      row(account.user, 'OWNER', account.createdAt),
      ...account.members.map((member) =>
        row(member.user, member.role, member.createdAt),
      ),
    ];
  }

  async changeRole(
    userId: string,
    accountId: string,
    memberId: string,
    role: AccountMemberRole,
  ) {
    await this.access.assertAccess(userId, accountId, 'manage');
    const { count } = await this.prisma.accountMember.updateMany({
      where: { accountId, userId: memberId },
      data: { role },
    });
    if (count === 0) throw notFound();
  }

  async remove(userId: string, accountId: string, memberId: string) {
    await this.access.assertAccess(userId, accountId, 'manage');
    await this.drop(accountId, memberId);
  }

  async leave(userId: string, accountId: string) {
    await this.access.assertAccess(userId, accountId, 'leave');
    await this.drop(accountId, userId);
  }

  /** Their cached figures included the account, so those go with the membership. */
  private async drop(accountId: string, memberId: string) {
    const { count } = await this.prisma.accountMember.deleteMany({
      where: { accountId, userId: memberId },
    });
    if (count === 0) throw notFound();
    this.events.emit(DomainEvents.AccountAccessChanged, {
      userIds: [memberId],
    } satisfies AccountAccessChangedEvent);
  }

  /**
   * The visibility level is each person's own: the owner's stays in Account.metadata, a member's
   * on their membership.
   */
  async setVisibility(
    userId: string,
    accountId: string,
    visibility: AccountVisibility,
  ) {
    const { account, role } = await this.access.assertAccess(
      userId,
      accountId,
      'view',
    );
    if (role !== 'OWNER') {
      await this.prisma.accountMember.update({
        where: { accountId_userId: { accountId, userId } },
        data: { visibility },
      });
    } else {
      await this.prisma.account.update({
        where: { id: accountId },
        data: {
          metadata: withVisibility(
            account.metadata,
            visibility,
          ) as Prisma.InputJsonValue,
        },
      });
    }
    // "All accounts" figures are cached per person.
    this.events.emit(DomainEvents.AccountAccessChanged, {
      userIds: [userId],
    } satisfies AccountAccessChangedEvent);
    return { visibility };
  }

  /**
   * Accounts the user owns that others can reach: what deleting or resetting would take from those
   * people.
   */
  async sharedAccountsOwnedBy(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId, members: { some: {} } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        archivedAt: true,
        members: {
          orderBy: { createdAt: 'asc' },
          select: {
            role: true,
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
    });
    return accounts.map(({ members, ...account }) => ({
      ...account,
      members: members.map(({ role, user }) => ({
        userId: user.id,
        displayName: user.displayName,
        email: user.email,
        role,
      })),
    }));
  }
}
