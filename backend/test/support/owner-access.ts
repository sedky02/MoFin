import { NotFoundException } from '@nestjs/common';
import { AccountRole } from '../../src/modules/account-access/account-access';

type OwnedAccount = {
  id: string;
  userId: unknown;
  archivedAt?: unknown;
};

/**
 * AccountAccessService over a spec's fixtures, for e2e specs whose fake Prisma
 * has no memberships: each account is reachable by its owner alone. Sharing
 * itself is proved against Postgres in authorization.db-spec.ts.
 */
export function ownerAccess(
  accounts: OwnedAccount[],
  ownerOfTransaction: (id: string) => unknown = () => undefined,
) {
  const owned = (userId: string) => accounts.filter((a) => a.userId === userId);
  return {
    assertAccess: async (
      userId: string,
      accountId: string,
      _action: string,
      { activeOnly = false }: { activeOnly?: boolean } = {},
    ) => {
      const account = owned(userId).find((a) => a.id === accountId);
      if (!account || (activeOnly && account.archivedAt))
        throw new NotFoundException(`Account ${accountId} not found`);
      return { account, role: 'OWNER' as AccountRole };
    },
    accessibleAccountIds: async (userId: string) =>
      owned(userId).map((a) => a.id),
    rolesOn: async (userId: string, ids: string[]) =>
      new Map<string, AccountRole>(
        owned(userId)
          .filter((a) => ids.includes(a.id))
          .map((a) => [a.id, 'OWNER']),
      ),
    assertTransactionAccess: async (userId: string, id: string) => {
      const owner = ownerOfTransaction(id);
      if (owner === undefined) throw new NotFoundException();
      if (owner !== userId) throw new NotFoundException();
      return { id };
    },
    usersWithAccess: async () => [],
  };
}
