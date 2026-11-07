import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Account, Prisma } from '@prisma/client';
import {
  accountVisibility,
  visibilityOfMetadata,
} from '../accounts/account-visibility';
import { PrismaService } from '../../database/prisma.service';
import {
  AccountAction,
  AccountRole,
  accountScope,
  can,
} from './account-access';

type Db = Prisma.TransactionClient;

export interface AccessOptions {
  /** Pass the caller's transaction so a check and its write see the same data. */
  db?: Db;
  /** Treat an archived account like a missing one: it is read-only until restored. */
  activeOnly?: boolean;
}

export interface AccountAccess {
  account: Account;
  role: AccountRole;
}

const notAllowed = () =>
  new ForbiddenException("Your role on this account doesn't allow this");

/**
 * Decides who can reach an account. Roles are read on every check, so removal applies at once. No
 * access is a 404 (ids can't be probed); 403 means visible but not allowed.
 */
@Injectable()
export class AccountAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(
    userId: string,
    accountId: string,
    action: AccountAction,
    { db = this.prisma, activeOnly = false }: AccessOptions = {},
  ): Promise<AccountAccess> {
    const found = await db.account.findFirst({
      where: {
        id: accountId,
        ...accountScope(userId, 'view'),
        ...(activeOnly ? { archivedAt: null } : {}),
      },
      include: { members: { where: { userId }, select: { role: true } } },
    });
    if (!found) throw new NotFoundException(`Account ${accountId} not found`);

    const { members, ...account } = found;
    const role: AccountRole =
      account.userId === userId ? 'OWNER' : members[0].role;
    if (!can(role, action)) throw notAllowed();
    return { account, role };
  }

  async accessibleAccountIds(
    userId: string,
    action: AccountAction,
    { db = this.prisma, activeOnly = false }: AccessOptions = {},
  ): Promise<string[]> {
    const accounts = await db.account.findMany({
      where: {
        ...accountScope(userId, action),
        ...(activeOnly ? { archivedAt: null } : {}),
      },
      select: { id: true },
    });
    return accounts.map((account) => account.id);
  }

  /**
   * The accounts that count in this person's "All accounts" figures: those they can reach minus
   * the ones they set to a level that leaves totals (private, hidden). Asking for one account by
   * id never goes through here.
   */
  async accountIdsForTotals(
    userId: string,
    { db = this.prisma, activeOnly = false }: AccessOptions = {},
  ): Promise<string[]> {
    const accounts = await db.account.findMany({
      where: {
        ...accountScope(userId, 'view'),
        ...(activeOnly ? { archivedAt: null } : {}),
      },
      select: {
        id: true,
        userId: true,
        metadata: true,
        members: { where: { userId }, select: { visibility: true } },
      },
    });
    return accounts
      .filter((account) => {
        const level =
          account.userId === userId
            ? visibilityOfMetadata(account.metadata)
            : account.members[0]?.visibility;
        return accountVisibility(level).countInTotals;
      })
      .map((account) => account.id);
  }

  /** The user's role on each of these accounts; the ones they can't reach are left out. */
  async rolesOn(
    userId: string,
    accountIds: string[],
    db: Db = this.prisma,
  ): Promise<Map<string, AccountRole>> {
    const accounts = await db.account.findMany({
      where: { id: { in: accountIds }, ...accountScope(userId, 'view') },
      select: {
        id: true,
        userId: true,
        members: { where: { userId }, select: { role: true } },
      },
    });
    return new Map(
      accounts.map((account) => [
        account.id,
        account.userId === userId ? 'OWNER' : account.members[0].role,
      ]),
    );
  }

  /**
   * Seeing a transaction takes access to one of its accounts; changing it takes `action` on all of
   * them, because a change moves money on each.
   */
  async assertTransactionAccess(
    userId: string,
    transactionId: string,
    action: AccountAction,
    { db = this.prisma }: Pick<AccessOptions, 'db'> = {},
  ) {
    const notFound = () => new NotFoundException('Transaction not found');
    const transaction = await db.transaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        userId: true,
        recurringFromAccountId: true,
        recurringToAccountId: true,
        items: { select: { accountId: true } },
      },
    });
    if (!transaction) throw notFound();

    const accountIds = [
      ...new Set(
        [
          ...transaction.items.map((item) => item.accountId),
          transaction.recurringFromAccountId,
          transaction.recurringToAccountId,
        ].filter((id): id is string => id !== null),
      ),
    ];
    // Touches no account, so only the ledger it belongs to can answer for it.
    if (!accountIds.length) {
      if (transaction.userId !== userId) throw notFound();
      return transaction;
    }

    const roles = await this.rolesOn(userId, accountIds, db);
    if (roles.size === 0) throw notFound();
    const allowed = (accountId: string) => {
      const role = roles.get(accountId);
      return role !== undefined && can(role, action);
    };
    const passes =
      action === 'view' ? accountIds.some(allowed) : accountIds.every(allowed);
    if (!passes) throw notAllowed();
    return transaction;
  }

  /** Everyone who can reach any of these accounts, e.g. whose cached figures a change makes stale. */
  async usersWithAccess(
    accountIds: string[],
    db: Db = this.prisma,
  ): Promise<string[]> {
    const accounts = await db.account.findMany({
      where: { id: { in: accountIds } },
      select: { userId: true, members: { select: { userId: true } } },
    });
    return [
      ...new Set(
        accounts.flatMap((account) => [
          account.userId,
          ...account.members.map((member) => member.userId),
        ]),
      ),
    ];
  }
}
