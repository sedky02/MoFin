import { AccountRole } from '../../src/modules/account-access/account-access';

/**
 * AccountAccessService for unit specs of the services on top of it: everything
 * passes, as the owner of the account. What each role may really do is proved
 * against Postgres in account-access.db-spec.ts and authorization.db-spec.ts.
 */
export function fakeAccess(accounts: string[] = ['a1'], ownerId = 'u1') {
  return {
    assertAccess: jest.fn(
      async (_userId: string, accountId: string): Promise<unknown> => ({
        account: { id: accountId, userId: ownerId, currency: 'USD' },
        role: 'OWNER' as AccountRole,
      }),
    ),
    accessibleAccountIds: jest.fn(async () => accounts),
    rolesOn: jest.fn(
      async (_userId: string, ids: string[]) =>
        new Map<string, AccountRole>(ids.map((id) => [id, 'OWNER'])),
    ),
    assertTransactionAccess: jest.fn(async () => ({})),
    usersWithAccess: jest.fn(async (): Promise<string[]> => []),
  };
}
