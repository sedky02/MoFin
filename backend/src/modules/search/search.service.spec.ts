import { BadRequestException } from '@nestjs/common';
import { fakeAccess } from '../../../test/support/fake-account-access';
import { Prisma } from '@prisma/client';
import { TRANSACTION_INCLUDE } from '../transactions/transaction-include';
import { SearchService, transactionTotal } from './search.service';

describe('SearchService.searchTransactions', () => {
  it('never returns deleted transactions', async () => {
    const paginate = jest.fn(async () => ({
      data: [],
      total: 0,
      limit: 20,
      offset: 0,
    }));
    const prisma = { paginated: { transaction: { paginate } } };
    const service = new SearchService(
      prisma as never,
      fakeAccess() as never,
      {} as never,
    );
    await service.searchTransactions('u1', { limit: 20, offset: 0 });
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          items: { some: { accountId: { in: ['a1'] } } },
        }),
      }),
    );
  });

  function makeService(paginateResult: unknown) {
    const paginate = jest.fn(async () => paginateResult);
    const prisma = { paginated: { transaction: { paginate } } };
    const accountsService = fakeAccess();
    const categoriesService = { assertReadable: jest.fn(async () => ({})) };
    const service = new SearchService(
      prisma as never,
      accountsService as never,
      categoriesService as never,
    );
    return { service, paginate };
  }

  it('returns the paginated shape — total reflects the full match count, not just this page', async () => {
    const page = {
      data: Array.from({ length: 10 }, (_, i) => ({
        id: `tx${i}`,
        items: [],
        recurringFromAccountId: null,
        recurringToAccountId: null,
      })),
      total: 25,
      limit: 10,
      offset: 0,
    };
    const { service, paginate } = makeService(page);

    const result = await service.searchTransactions('u1', {
      limit: 10,
      offset: 0,
    });

    expect(result).toMatchObject(page);
    expect(result.data).toHaveLength(10);
    expect(result.total).toBe(25);
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          items: { some: { accountId: { in: ['a1'] } } },
        }),
        limit: 10,
        offset: 0,
      }),
    );
  });

  it('checks account ownership and category availability before querying', async () => {
    const paginate = jest.fn(async () => ({
      data: [],
      total: 0,
      limit: 20,
      offset: 0,
    }));
    const prisma = { paginated: { transaction: { paginate } } };
    const accountsService = fakeAccess();
    const categoriesService = { assertReadable: jest.fn(async () => ({})) };
    const service = new SearchService(
      prisma as never,
      accountsService as never,
      categoriesService as never,
    );

    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      accountId: 'a1',
      categoryId: 'c1',
    });

    expect(accountsService.assertAccess).toHaveBeenCalledWith(
      'u1',
      'a1',
      'view',
    );
    expect(categoriesService.assertReadable).toHaveBeenCalledWith('u1', 'c1');
  });

  it('includes each ledger leg with its account so results can name accounts', async () => {
    const { service, paginate } = makeService({
      data: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    await service.searchTransactions('u1', { limit: 20, offset: 0 });

    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        include: TRANSACTION_INCLUDE,
      }),
    );
  });
});

describe('SearchService date range', () => {
  it('rejects a range whose start is after its end, before querying', async () => {
    const paginate = jest.fn();
    const service = new SearchService(
      { paginated: { transaction: { paginate } } } as never,
      fakeAccess() as never,
      {} as never,
    );
    await expect(
      service.searchTransactions('u1', {
        limit: 20,
        offset: 0,
        from: '2026-05-01',
        to: '2026-04-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(paginate).not.toHaveBeenCalled();
  });
});

describe('SearchService category filter', () => {
  function makeService() {
    const paginate = jest.fn(
      async (_args: { where: Record<string, unknown> }) => ({
        data: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    );
    const prisma = { paginated: { transaction: { paginate } } };
    const accountsService = fakeAccess();
    const categoriesService = { assertReadable: jest.fn(async () => ({})) };
    const service = new SearchService(
      prisma as never,
      accountsService as never,
      categoriesService as never,
    );
    return { service, paginate };
  }

  it("matches a split by one of its lines' categories as well as the transaction's own", async () => {
    const { service, paginate } = makeService();

    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      categoryId: 'dining',
    });

    const { where } = paginate.mock.calls[0][0];
    expect(where.OR).toEqual([
      { categoryId: 'dining' },
      { items: { some: { categoryId: 'dining' } } },
    ]);
    // Not a top-level equality, which would miss every split (they carry no category of their own).
    expect(where).not.toHaveProperty('categoryId');
  });

  it('keeps the account filter alongside the line-category match', async () => {
    const { service, paginate } = makeService();

    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      categoryId: 'dining',
      accountId: 'a1',
    });

    const { where } = paginate.mock.calls[0][0];
    expect(where.OR).toEqual([
      { categoryId: 'dining' },
      { items: { some: { categoryId: 'dining' } } },
    ]);
    expect(where.items).toEqual({ some: { accountId: { in: ['a1'] } } });
  });

  it('adds no category condition when no category is asked for', async () => {
    const { service, paginate } = makeService();

    await service.searchTransactions('u1', { limit: 20, offset: 0 });

    const { where } = paginate.mock.calls[0][0];
    expect(where).not.toHaveProperty('OR');
    expect(where).not.toHaveProperty('categoryId');
  });
});

describe('SearchService date range', () => {
  type DateFilter = { gte?: Date; lt?: Date; lte?: Date };

  function makeService() {
    const paginate = jest.fn(
      async (_args: { where: { occurredAt?: DateFilter } }) => ({
        data: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    );
    const prisma = { paginated: { transaction: { paginate } } };
    const service = new SearchService(
      prisma as never,
      fakeAccess() as never,
      {} as never,
    );
    return { service, paginate };
  }

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
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      ...range,
    });
    return paginate.mock.calls[0][0].where.occurredAt!;
  }

  it('from = to = one day returns that whole day', async () => {
    const filter = await occurredAtFilter({
      from: '2026-10-24',
      to: '2026-10-24',
    });

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
    const filter = await occurredAtFilter({
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-24T12:00:00.000Z',
    });

    expect(matches(filter, '2026-10-24T12:00:00.000Z')).toBe(true);
    expect(matches(filter, '2026-10-24T12:00:00.001Z')).toBe(false);
  });

  it('adds no date condition without a range', async () => {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', { limit: 20, offset: 0 });
    expect(paginate.mock.calls[0][0].where).not.toHaveProperty('occurredAt');
  });
});

describe('SearchService type, recurrence and sort', () => {
  type FindManyArgs = {
    where: Record<string, unknown>;
    select?: unknown;
    include?: unknown;
  };

  function makeService(matches: unknown[] = []) {
    const paginate = jest.fn(
      async (_args: { where: Record<string, unknown>; orderBy: unknown }) => ({
        data: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    );
    // First call ranks the matches (select), second loads the page (include).
    const findMany = jest.fn(async (args: FindManyArgs) => {
      if (args.select) return matches;
      const ids = (args.where.id as { in: string[] }).in;
      // Out of order on purpose: the page must come back in ranked order.
      return [...ids].reverse().map((id) => ({
        id,
        items: [],
        recurringFromAccountId: null,
        recurringToAccountId: null,
      }));
    });
    const prisma = {
      paginated: { transaction: { paginate } },
      transaction: { findMany },
    };
    const accountsService = fakeAccess();
    const categoriesService = { assertReadable: jest.fn(async () => ({})) };
    const service = new SearchService(
      prisma as never,
      accountsService as never,
      categoriesService as never,
    );
    return { service, paginate, findMany, accountsService };
  }

  const leg = (direction: 'DEBIT' | 'CREDIT', amount: string) => ({
    accountId: 'a1',
    direction,
    amount: new Prisma.Decimal(amount),
  });
  const match = (
    id: string,
    occurredAt: string,
    items: ReturnType<typeof leg>[],
  ) => ({
    id,
    occurredAt: new Date(occurredAt),
    createdAt: new Date(occurredAt),
    items,
    recurringFromAccountId: null,
    recurringToAccountId: null,
  });

  it('filters by transaction type', async () => {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      type: 'TRANSFER',
    } as never);
    expect(paginate.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ type: 'TRANSFER', deletedAt: null }),
    );
  });

  it('treats a series root and its generated occurrences as recurring', async () => {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      recurrence: 'recurring',
      categoryId: 'rent',
    } as never);
    const { where } = paginate.mock.calls[0][0];
    expect(where.AND).toEqual([
      { OR: [{ isRecurring: true }, { parentTransactionId: { not: null } }] },
    ]);
    expect(where.OR).toEqual([
      { categoryId: 'rent' },
      { items: { some: { categoryId: 'rent' } } },
    ]);
    expect(where.deletedAt).toBeNull();
  });

  it('keeps one-off transactions to those outside any series', async () => {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      recurrence: 'one-off',
    } as never);
    const { where } = paginate.mock.calls[0][0];
    expect(where).toEqual(
      expect.objectContaining({
        isRecurring: false,
        parentTransactionId: null,
        deletedAt: null,
      }),
    );
    expect(where).not.toHaveProperty('AND');
  });

  it('lists a series once, by its root, and never a deleted root', async () => {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      recurrence: 'series',
      accountId: 'dinar',
    } as never);
    const { where } = paginate.mock.calls[0][0];
    expect(where).toEqual(
      expect.objectContaining({
        items: { some: { accountId: { in: ['dinar'] } } },
        isRecurring: true,
        parentTransactionId: null,
        deletedAt: null,
      }),
    );
    // Not the roots-and-occurrences match of `recurring`.
    expect(where).not.toHaveProperty('AND');
    expect(where.items).toEqual({
      some: { accountId: { in: ['dinar'] } },
    });
  });

  it('sorts active series first, soonest next occurrence first, then newest', async () => {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      recurrence: 'series',
      sort: 'next-occurrence',
    } as never);
    expect(paginate.mock.calls[0][0].orderBy).toEqual([
      { recurringStatus: { sort: 'asc', nulls: 'last' } },
      { nextOccurrenceAt: { sort: 'asc', nulls: 'last' } },
      { occurredAt: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it('adds no type or recurrence condition when neither is asked for', async () => {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', { limit: 20, offset: 0 });
    const { where } = paginate.mock.calls[0][0];
    expect(where).not.toHaveProperty('type');
    expect(where).not.toHaveProperty('AND');
    expect(where).not.toHaveProperty('isRecurring');
  });

  it('sorts newest first by default and oldest first on request', async () => {
    const { service, paginate } = makeService();
    await service.searchTransactions('u1', { limit: 20, offset: 0 });
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      sort: 'oldest',
    } as never);
    expect(paginate.mock.calls[0][0].orderBy).toEqual([
      { occurredAt: 'desc' },
      { createdAt: 'desc' },
    ]);
    expect(paginate.mock.calls[1][0].orderBy).toEqual([
      { occurredAt: 'asc' },
      { createdAt: 'asc' },
    ]);
  });

  const MATCHES = [
    match('coffee', '2026-10-03', [leg('DEBIT', '4.5')]),
    // A split: its total is both lines.
    match('groceries', '2026-10-02', [leg('DEBIT', '30'), leg('DEBIT', '25')]),
    // A transfer's legs carry the same amount; it moved 500, not 1000.
    match('transfer', '2026-10-01', [
      leg('DEBIT', '500'),
      leg('CREDIT', '500'),
    ]),
    match('salary', '2026-09-30', [leg('CREDIT', '2000')]),
    // Same total as the coffee, older: comes after it either way.
    match('snack', '2026-09-01', [leg('DEBIT', '4.5')]),
  ];

  it('sorts by amount high to low, newest first between equal totals', async () => {
    const { service, paginate, findMany } = makeService(MATCHES);
    const result = await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      sort: 'amount-desc',
      recurrence: 'one-off',
    } as never);

    expect(paginate).not.toHaveBeenCalled();
    expect(result.data.map((tx) => tx.id)).toEqual([
      'salary',
      'transfer',
      'groceries',
      'coffee',
      'snack',
    ]);
    expect(result.total).toBe(5);
    expect(findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        items: { some: { accountId: { in: ['a1'] } } },
        deletedAt: null,
        isRecurring: false,
      }),
    );
  });

  it('sorts by amount low to high and loads only the requested page', async () => {
    const { service, findMany } = makeService(MATCHES);
    const result = await service.searchTransactions('u1', {
      limit: 2,
      offset: 2,
      sort: 'amount-asc',
    } as never);

    expect(result).toEqual(
      expect.objectContaining({ total: 5, limit: 2, offset: 2 }),
    );
    // Low to high, the coffee and the snack tie at 4.5: newest (coffee) first.
    expect(result.data.map((tx) => tx.id)).toEqual(['groceries', 'transfer']);
    expect(findMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        where: { id: { in: ['groceries', 'transfer'] } },
        include: expect.anything(),
      }),
    );
  });

  it('accepts an archived account in the account filter (read check, not the write check)', async () => {
    const { service, paginate, accountsService } = makeService();
    accountsService.assertAccess.mockResolvedValue({
      id: 'old-savings',
      archivedAt: new Date(),
    });

    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      accountId: 'old-savings',
    });

    expect(accountsService.assertAccess).toHaveBeenCalledWith(
      'u1',
      'old-savings',
      'view',
    );
    expect(paginate.mock.calls[0][0].where.items).toEqual({
      some: { accountId: { in: ['old-savings'] } },
    });
  });
});

describe('SearchService amount range', () => {
  function setup(ids: string[]) {
    const paginate = jest.fn(async () => ({
      data: [],
      total: 0,
      limit: 20,
      offset: 0,
    }));
    const queryRaw = jest.fn(async () => ids.map((id) => ({ id })));
    const prisma = {
      $queryRaw: queryRaw,
      paginated: { transaction: { paginate } },
    };
    const service = new SearchService(
      prisma as never,
      fakeAccess() as never,
      {} as never,
    );
    return { service, paginate, queryRaw };
  }

  const sqlOf = (queryRaw: jest.Mock) =>
    (queryRaw.mock.calls[0][0] as Prisma.Sql).sql;

  it('filters on the transaction total, not on a single line', async () => {
    const { service, paginate, queryRaw } = setup(['t1', 't2']);
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      minAmount: '80',
    });

    expect(sqlOf(queryRaw)).toContain('GROUP BY ti."transactionId"');
    expect(sqlOf(queryRaw)).toContain('>=');
    expect(sqlOf(queryRaw)).not.toContain('<=');
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['t1', 't2'] } }),
      }),
    );
  });

  it('applies both bounds and still scopes by account on the lines', async () => {
    const { service, paginate, queryRaw } = setup(['t1']);
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      minAmount: '10',
      maxAmount: '200',
      accountId: 'a1',
    });

    expect(sqlOf(queryRaw)).toContain('>=');
    expect(sqlOf(queryRaw)).toContain('<=');
    const where = (
      paginate.mock.calls[0] as unknown as [{ where: Record<string, unknown> }]
    )[0].where;
    expect(where.items).toEqual({ some: { accountId: { in: ['a1'] } } });
  });

  it('matches nothing when no transaction total is in range', async () => {
    const { service, paginate } = setup([]);
    await service.searchTransactions('u1', {
      limit: 20,
      offset: 0,
      maxAmount: '1',
    });
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [] } }),
      }),
    );
  });

  it('runs no amount query without a bound', async () => {
    const { service, queryRaw } = setup([]);
    await service.searchTransactions('u1', { limit: 20, offset: 0 });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('transactionTotal', () => {
  const d = (v: string) => new Prisma.Decimal(v);

  it('adds expense lines, reads a transfer once and reads income from its credit side', () => {
    const split = [
      { direction: 'DEBIT', amount: d('12.345') },
      { direction: 'DEBIT', amount: d('0.655') },
    ];
    expect(transactionTotal(split).toString()).toBe('13');
    const transfer = [
      { direction: 'DEBIT', amount: d('500') },
      { direction: 'CREDIT', amount: d('500') },
    ];
    expect(transactionTotal(transfer).toString()).toBe('500');
    expect(
      transactionTotal([{ direction: 'CREDIT', amount: d('2000') }]).toString(),
    ).toBe('2000');
    expect(transactionTotal([]).toString()).toBe('0');
  });
});
