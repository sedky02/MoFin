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
});
