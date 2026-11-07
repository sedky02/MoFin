import { AccountAccessService } from './account-access.service';

const row = (
  id: string,
  userId: string,
  metadata: unknown = {},
  memberLevel?: string,
) => ({
  id,
  userId,
  metadata,
  members: memberLevel ? [{ visibility: memberLevel }] : [],
});

function serviceWith(rows: ReturnType<typeof row>[]) {
  const prisma = { account: { findMany: jest.fn().mockResolvedValue(rows) } };
  return new AccountAccessService(prisma as never);
}

describe('AccountAccessService.accountIdsForTotals', () => {
  it('counts visible and masked accounts, leaves out private and hidden ones', async () => {
    const service = serviceWith([
      row('a', 'u1'),
      row('b', 'u1', { visibility: 'masked' }),
      row('c', 'u1', { visibility: 'private' }),
      row('d', 'u1', { visibility: 'hidden' }),
    ]);
    await expect(service.accountIdsForTotals('u1')).resolves.toEqual([
      'a',
      'b',
    ]);
  });

  it("uses a member's own level on someone else's account, not the owner's", async () => {
    const service = serviceWith([
      row('shared-1', 'owner', { visibility: 'private' }, 'visible'),
      row('shared-2', 'owner', {}, 'private'),
    ]);
    await expect(service.accountIdsForTotals('guest')).resolves.toEqual([
      'shared-1',
    ]);
  });

  it('reads an unknown level as visible, so money is never dropped by accident', async () => {
    const service = serviceWith([row('a', 'u1', { visibility: 'secret' })]);
    await expect(service.accountIdsForTotals('u1')).resolves.toEqual(['a']);
  });
});
