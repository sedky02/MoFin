import { SearchService } from './search.service';

describe('SearchService.searchTransactions', () => {
  it('never returns deleted transactions', async () => {
    const paginate = jest.fn(async () => ({ data: [], total: 0, limit: 20, offset: 0 }));
    const prisma = { paginated: { transaction: { paginate } } };
    const service = new SearchService(prisma as never, {} as never, {} as never);
    await service.searchTransactions('u1', { limit: 20, offset: 0 } as never);
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', deletedAt: null }) }),
    );
  });

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

describe('SearchService date range', () => {
  type DateFilter = { gte?: Date; lt?: Date; lte?: Date };

  function makeService() {
    const paginate = jest.fn(async (_args: { where: { occurredAt?: DateFilter } }) => ({ data: [], total: 0, limit: 20, offset: 0 }));
    const prisma = { paginated: { transaction: { paginate } } };
    const service = new SearchService(prisma as never, {} as never, {} as never);
    return { service, paginate };
  }

  /** Whether a transaction at `iso` passes the occurredAt filter the service built. */
  function matches(filter: DateFilter, iso: string) {
    const at = new Date(iso).getTime();
    return (
      (filter.gte === undefined || at >= filter.gte.getTime()) &&
      (filter.lt === undefined || at < filter.lt.getTime()) &&
      (filter.lte === undefined || at <= filter.lte.getTime())
    );
  }

  async function occurredAtFilter(range: { from?: string; to?: string }) {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', { limit: 20, offset: 0, ...range } as never);
    return paginate.mock.calls[0][0].where.occurredAt!;
  }

  it('from = to = one day returns that whole day', async () => {
    const filter = await occurredAtFilter({ from: '2026-10-24', to: '2026-10-24' });

    expect(matches(filter, '2026-10-24T00:00:00.000Z')).toBe(true);
    expect(matches(filter, '2026-10-24T12:00:00.000Z')).toBe(true);
    expect(matches(filter, '2026-10-24T23:59:00.000Z')).toBe(true);
    expect(matches(filter, '2026-10-24T23:59:59.999Z')).toBe(true);
    expect(matches(filter, '2026-10-23T23:59:59.999Z')).toBe(false);
    expect(matches(filter, '2026-10-25T00:00:00.000Z')).toBe(false);
  });

  it('a date-only `to` on its own includes its last day', async () => {
    const filter = await occurredAtFilter({ to: '2026-10-31' });

    expect(filter).not.toHaveProperty('gte');
    expect(matches(filter, '2026-10-31T23:59:00.000Z')).toBe(true);
    expect(matches(filter, '2026-11-01T00:00:00.000Z')).toBe(false);
  });

  it('keeps a datetime `to` as an inclusive instant', async () => {
    const filter = await occurredAtFilter({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-24T12:00:00.000Z' });

    expect(matches(filter, '2026-10-24T12:00:00.000Z')).toBe(true);
    expect(matches(filter, '2026-10-24T12:00:00.001Z')).toBe(false);
  });

  it('adds no date condition without a range', async () => {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', { limit: 20, offset: 0 } as never);
    expect(paginate.mock.calls[0][0].where).not.toHaveProperty('occurredAt');
  });
});
