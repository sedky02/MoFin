import { SearchService } from './search.service';

describe('SearchService.searchTransactions', () => {
  function makeService(paginateResult: unknown) {
    const paginate = jest.fn(async () => paginateResult);
    const prisma = { paginated: { transaction: { paginate } } };
    const accountsService = { assertOwned: jest.fn(async () => ({})) };
    const categoriesService = { assertAvailable: jest.fn(async () => ({})) };
    const service = new SearchService(prisma as never, accountsService as never, categoriesService as never);
    return { service, paginate };
  }

  it('returns the paginated shape — total reflects the full match count, not just this page', async () => {
    const page = { data: Array.from({ length: 10 }, (_, i) => ({ id: `tx${i}` })), total: 25, limit: 10, offset: 0 };
    const { service, paginate } = makeService(page);

    const result = await service.searchTransactions('u1', { limit: 10, offset: 0 } as never);

    expect(result).toBe(page);
    expect(result.data).toHaveLength(10);
    expect(result.total).toBe(25);
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1' }),
        limit: 10,
        offset: 0,
      }),
    );
  });

  it('checks account ownership and category availability before querying', async () => {
    const paginate = jest.fn(async () => ({ data: [], total: 0, limit: 20, offset: 0 }));
    const prisma = { paginated: { transaction: { paginate } } };
    const accountsService = { assertOwned: jest.fn(async () => ({})) };
    const categoriesService = { assertAvailable: jest.fn(async () => ({})) };
    const service = new SearchService(prisma as never, accountsService as never, categoriesService as never);

    await service.searchTransactions('u1', { limit: 20, offset: 0, accountId: 'a1', categoryId: 'c1' } as never);

    expect(accountsService.assertOwned).toHaveBeenCalledWith('u1', 'a1');
    expect(categoriesService.assertAvailable).toHaveBeenCalledWith('u1', 'c1');
  });

  it('includes each ledger leg with its account so results can name accounts', async () => {
    const { service, paginate } = makeService({ data: [], total: 0, limit: 20, offset: 0 });

    await service.searchTransactions('u1', { limit: 20, offset: 0 } as never);

    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { items: { include: { category: true, account: true } }, category: true },
      }),
    );
  });
});

describe('SearchService category filter', () => {
  function makeService() {
    const paginate = jest.fn(async (_args: { where: Record<string, unknown> }) => ({ data: [], total: 0, limit: 20, offset: 0 }));
    const prisma = { paginated: { transaction: { paginate } } };
    const accountsService = { assertOwned: jest.fn(async () => ({})) };
    const categoriesService = { assertAvailable: jest.fn(async () => ({})) };
    const service = new SearchService(prisma as never, accountsService as never, categoriesService as never);
    return { service, paginate };
  }

  it("matches a split by one of its lines' categories as well as the transaction's own", async () => {
    const { service, paginate } = makeService();

    await service.searchTransactions('u1', { limit: 20, offset: 0, categoryId: 'dining' } as never);

    const { where } = paginate.mock.calls[0][0];
    expect(where.OR).toEqual([{ categoryId: 'dining' }, { items: { some: { categoryId: 'dining' } } }]);
    // Not a top-level equality, which would miss every split (they carry no category of their own).
    expect(where).not.toHaveProperty('categoryId');
  });

  it('keeps the account filter alongside the line-category match', async () => {
    const { service, paginate } = makeService();

    await service.searchTransactions('u1', { limit: 20, offset: 0, categoryId: 'dining', accountId: 'a1' } as never);

    const { where } = paginate.mock.calls[0][0];
    expect(where.OR).toEqual([{ categoryId: 'dining' }, { items: { some: { categoryId: 'dining' } } }]);
    expect(where.items).toEqual({ some: expect.objectContaining({ accountId: 'a1' }) });
  });

  it('adds no category condition when no category is asked for', async () => {
    const { service, paginate } = makeService();

    await service.searchTransactions('u1', { limit: 20, offset: 0 } as never);

    const { where } = paginate.mock.calls[0][0];
    expect(where).not.toHaveProperty('OR');
    expect(where).not.toHaveProperty('categoryId');
  });
});
