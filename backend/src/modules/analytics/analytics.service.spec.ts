import { BadRequestException } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService.getMonthlySummary', () => {
  function makeService(transactions: unknown[]) {
    const prisma = {
      analyticsCache: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => undefined),
      },
      transaction: { findMany: jest.fn(async () => transactions) },
    };
    return { service: new AnalyticsService(prisma as never), prisma };
  }

  it('leaves deleted transactions out of the month', async () => {
    const { service, prisma } = makeService([]);
    await service.getMonthlySummary('u1', 2026, 7, false, undefined, 'USD');
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1', deletedAt: null }),
      }),
    );
  });

  it("never counts an account's opening balance as income", async () => {
    // An account opened with 5000 and one 100 salary this month: income is the salary only.
    const { service, prisma } = makeService([
      {
        type: TransactionType.INCOME,
        category: null,
        items: [
          {
            accountId: 'acc-a',
            amount: new Prisma.Decimal('100'),
            currency: 'USD',
          },
        ],
      },
    ]);
    const account = {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    };
    Object.assign(prisma, { account });
    const result = (await service.getMonthlySummary(
      'u1',
      2026,
      10,
      false,
      'acc-a',
      'USD',
    )) as {
      income: string;
      expenses: string;
      savingsRate: string;
    };
    expect(result).toEqual(
      expect.objectContaining({
        income: '100',
        expenses: '0',
        savingsRate: '1.0000',
      }),
    );
    expect(account.aggregate).not.toHaveBeenCalled();
    expect(account.findMany).not.toHaveBeenCalled();
    expect(account.findFirst).not.toHaveBeenCalled();
  });

  const item = (accountId: string, amount: string, currency = 'TND') => ({
    accountId,
    amount: new Prisma.Decimal(amount),
    currency,
  });

  it('scopes income/expense totals to accountId when provided', async () => {
    const transactions = [
      {
        type: TransactionType.INCOME,
        category: null,
        items: [item('acc-a', '100')],
      },
      {
        type: TransactionType.EXPENSE,
        categoryId: 'cat-groceries',
        category: { name: 'Groceries', color: '#22c55e' },
        items: [item('acc-b', '40')],
      },
    ];
    const { service, prisma } = makeService(transactions);

    const result = (await service.getMonthlySummary(
      'u1',
      2026,
      7,
      false,
      'acc-a',
    )) as {
      income: string;
      expenses: string;
      categoryBreakdown: {
        category: string;
        color: string | null;
        amount: string;
      }[];
    };

    expect(result.income).toBe('100');
    expect(result.expenses).toBe('0');
    // Scoped to acc-a, so the Groceries item (on acc-b) is filtered out entirely —
    // per-item attribution means it never enters the breakdown at all.
    expect(result.categoryBreakdown).toEqual([]);
    // Filters the transaction query itself, not just post-processing.
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          items: { some: { accountId: 'acc-a' } },
        }),
      }),
    );
  });

  it('restricts an all-accounts summary to one currency', async () => {
    const transactions = [
      {
        type: TransactionType.INCOME,
        category: null,
        items: [item('acc-usd', '100', 'USD')],
      },
      {
        type: TransactionType.INCOME,
        category: null,
        items: [item('acc-tnd', '900', 'TND')],
      },
      {
        type: TransactionType.EXPENSE,
        category: { name: 'Rent' },
        items: [item('acc-tnd', '300', 'TND')],
      },
    ];
    const { service, prisma } = makeService(transactions);

    const result = (await service.getMonthlySummary(
      'u1',
      2026,
      7,
      false,
      undefined,
      'TND',
    )) as {
      income: string;
      expenses: string;
    };

    expect(result.income).toBe('900');
    expect(result.expenses).toBe('300');
    // Currency is applied per item, so the query itself is not narrowed by it, and the
    // other currency's activity is still reported.
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ items: expect.anything() }),
      }),
    );
    expect(
      (result as unknown as { activeCurrencies: string[] }).activeCurrencies,
    ).toEqual(['TND', 'USD']);
    expect(prisma.analyticsCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_cacheKey: {
            userId: 'u1',
            cacheKey: 'monthly-summary:v3:2026:7:cur:TND',
          },
        },
      }),
    );
  });

  it('aggregates across all accounts when accountId is omitted', async () => {
    const transactions = [
      {
        type: TransactionType.INCOME,
        category: null,
        items: [item('acc-a', '100')],
      },
      {
        type: TransactionType.EXPENSE,
        category: { name: 'Rent' },
        items: [item('acc-b', '40')],
      },
    ];
    const { service } = makeService(transactions);

    const result = (await service.getMonthlySummary(
      'u1',
      2026,
      7,
      false,
      undefined,
      'TND',
    )) as {
      income: string;
      expenses: string;
    };

    expect(result.income).toBe('100');
    expect(result.expenses).toBe('40');
  });

  it('attributes a split expense per item, one category per split', async () => {
    const transactions = [
      {
        type: TransactionType.EXPENSE,
        categoryId: null,
        category: null,
        items: [
          {
            accountId: 'acc-a',
            amount: new Prisma.Decimal('30'),
            currency: 'TND',
            categoryId: 'cat-groceries',
            category: { name: 'Groceries', color: '#22c55e' },
          },
          {
            accountId: 'acc-a',
            amount: new Prisma.Decimal('20'),
            currency: 'TND',
            categoryId: 'cat-household',
            category: { name: 'Household', color: '#3b82f6' },
          },
        ],
      },
    ];
    const { service } = makeService(transactions);

    const result = (await service.getMonthlySummary(
      'u1',
      2026,
      7,
      false,
      undefined,
      'TND',
    )) as {
      expenses: string;
      categoryBreakdown: {
        category: string;
        color: string | null;
        amount: string;
      }[];
    };

    expect(result.expenses).toBe('50');
    expect(result.categoryBreakdown).toEqual(
      expect.arrayContaining([
        { category: 'Groceries', color: '#22c55e', amount: '30' },
        { category: 'Household', color: '#3b82f6', amount: '20' },
      ]),
    );
  });

  it("files a split's uncategorized line under Uncategorized, not under a stale top-level category", async () => {
    // A split saved before top-level categories were rejected on splits: the pre-split pick
    // (Groceries) is still on the transaction and was also copied to the first line.
    const groceries = { name: 'Groceries', color: '#22c55e' };
    const transactions = [
      {
        type: TransactionType.EXPENSE,
        categoryId: 'cat-groceries',
        category: groceries,
        items: [
          {
            accountId: 'acc-a',
            amount: new Prisma.Decimal('30'),
            currency: 'TND',
            categoryId: 'cat-groceries',
            category: groceries,
          },
          {
            accountId: 'acc-a',
            amount: new Prisma.Decimal('15'),
            currency: 'TND',
            categoryId: 'cat-dining',
            category: { name: 'Dining', color: '#f97316' },
          },
          {
            accountId: 'acc-a',
            amount: new Prisma.Decimal('5'),
            currency: 'TND',
            categoryId: null,
            category: null,
          },
        ],
      },
    ];
    const { service } = makeService(transactions);

    const result = (await service.getMonthlySummary(
      'u1',
      2026,
      7,
      false,
      undefined,
      'TND',
    )) as {
      categoryBreakdown: {
        category: string;
        color: string | null;
        amount: string;
      }[];
    };

    expect(result.categoryBreakdown).toHaveLength(3);
    expect(result.categoryBreakdown).toEqual(
      expect.arrayContaining([
        { category: 'Groceries', color: '#22c55e', amount: '30' },
        { category: 'Dining', color: '#f97316', amount: '15' },
        { category: 'Uncategorized', color: null, amount: '5' },
      ]),
    );
  });

  it("attributes an income split's lines the same way", async () => {
    const transactions = [
      {
        type: TransactionType.INCOME,
        categoryId: null,
        category: null,
        items: [
          {
            accountId: 'acc-a',
            amount: new Prisma.Decimal('900'),
            currency: 'TND',
            categoryId: 'cat-salary',
            category: { name: 'Salary', color: null },
          },
          {
            accountId: 'acc-a',
            amount: new Prisma.Decimal('100'),
            currency: 'TND',
            categoryId: null,
            category: null,
          },
        ],
      },
    ];
    const { service } = makeService(transactions);

    const result = (await service.getMonthlySummary(
      'u1',
      2026,
      7,
      false,
      undefined,
      'TND',
    )) as {
      incomeBreakdown: {
        category: string;
        color: string | null;
        amount: string;
      }[];
    };

    expect(result.incomeBreakdown).toEqual(
      expect.arrayContaining([
        { category: 'Salary', color: null, amount: '900' },
        { category: 'Uncategorized', color: null, amount: '100' },
      ]),
    );
  });

  it("still files an unsplit transaction's single line under the transaction's own category", async () => {
    const transactions = [
      {
        type: TransactionType.EXPENSE,
        categoryId: 'cat-rent',
        category: { name: 'Rent', color: '#ef4444' },
        items: [
          {
            accountId: 'acc-a',
            amount: new Prisma.Decimal('400'),
            currency: 'TND',
            categoryId: null,
            category: null,
          },
        ],
      },
    ];
    const { service } = makeService(transactions);

    const result = (await service.getMonthlySummary(
      'u1',
      2026,
      7,
      false,
      undefined,
      'TND',
    )) as {
      categoryBreakdown: {
        category: string;
        color: string | null;
        amount: string;
      }[];
    };

    expect(result.categoryBreakdown).toEqual([
      { category: 'Rent', color: '#ef4444', amount: '400' },
    ]);
  });

  it('uses a distinct cache key per account so scoped and unscoped summaries never collide', async () => {
    const { service, prisma } = makeService([]);

    await service.getMonthlySummary('u1', 2026, 7, false, 'acc-a');
    expect(prisma.analyticsCache.findUnique).toHaveBeenCalledWith({
      where: {
        userId_cacheKey: {
          userId: 'u1',
          cacheKey: 'monthly-summary:v3:2026:7:acc-a',
        },
      },
    });

    await service.getMonthlySummary('u1', 2026, 7, false, undefined, 'TND');
    expect(prisma.analyticsCache.findUnique).toHaveBeenCalledWith({
      where: {
        userId_cacheKey: {
          userId: 'u1',
          cacheKey: 'monthly-summary:v3:2026:7:cur:TND',
        },
      },
    });
  });

  it('refuses an all-accounts summary without a currency instead of adding currencies together', async () => {
    const { service, prisma } = makeService([]);

    await expect(
      service.getMonthlySummary('u1', 2026, 7, false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.analyticsCache.findUnique).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("keeps an archived account's other-currency activity out of the totals but lists its currency", async () => {
    // One active TND account, plus an archived EUR account that still had activity this month.
    const transactions = [
      {
        type: TransactionType.INCOME,
        category: null,
        items: [item('acc-tnd', '1200', 'TND')],
      },
      {
        type: TransactionType.EXPENSE,
        category: { name: 'Rent' },
        items: [item('acc-tnd', '400', 'TND')],
      },
      {
        type: TransactionType.INCOME,
        category: null,
        items: [item('acc-eur-archived', '50', 'EUR')],
      },
      {
        type: TransactionType.EXPENSE,
        category: { name: 'Travel' },
        items: [item('acc-eur-archived', '30', 'EUR')],
      },
    ];
    const { service } = makeService(transactions);

    const tnd = (await service.getMonthlySummary(
      'u1',
      2026,
      7,
      false,
      undefined,
      'TND',
    )) as {
      income: string;
      expenses: string;
      activeCurrencies: string[];
      categoryBreakdown: { category: string; amount: string }[];
    };
    expect(tnd.income).toBe('1200');
    expect(tnd.expenses).toBe('400');
    expect(tnd.categoryBreakdown.map((c) => c.category)).toEqual(['Rent']);
    expect(tnd.activeCurrencies).toEqual(['EUR', 'TND']);

    const eur = (await service.getMonthlySummary(
      'u1',
      2026,
      7,
      false,
      undefined,
      'EUR',
    )) as {
      income: string;
      expenses: string;
    };
    expect(eur.income).toBe('50');
    expect(eur.expenses).toBe('30');
  });
});

describe('AnalyticsService.getMonthlySeries', () => {
  // `openings` are accounts' opening balances by currency; the aggregate mock sums the requested one.
  function setup(
    rows: unknown[],
    cached: unknown = null,
    openings: Record<string, string> = {},
  ) {
    const prisma = {
      analyticsCache: {
        findUnique: jest.fn(async () => cached),
        upsert: jest.fn(async () => ({})),
      },
      $queryRaw: jest.fn(async () => rows),
      account: {
        aggregate: jest.fn(
          async ({ where }: { where: { currency: string } }) => ({
            _sum: {
              openingBalance: openings[where.currency]
                ? new Prisma.Decimal(openings[where.currency])
                : null,
            },
          }),
        ),
      },
    };
    return { service: new AnalyticsService(prisma as never), prisma };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('returns one point per month oldest-first, carrying the balance forward across empty months', async () => {
    const { service } = setup([
      { month: '2026-05', net: '1000', income: '1000', expenses: '0' }, // before the 3-month window: opening balance only
      { month: '2026-08', net: '-100', income: '0', expenses: '100' },
      { month: '2026-10', net: '250', income: '300', expenses: '50' },
    ]);
    const result = (await service.getMonthlySeries('u1', 3, 'USD')) as {
      points: {
        month: string;
        income: string;
        expenses: string;
        balance: string;
      }[];
    };

    expect(result.points).toEqual([
      { month: '2026-08', income: '0', expenses: '100', balance: '900' },
      { month: '2026-09', income: '0', expenses: '0', balance: '900' },
      { month: '2026-10', income: '300', expenses: '50', balance: '1150' },
    ]);
  });

  it('adds the opening balance to every point, empty months included', async () => {
    const { service } = setup(
      [{ month: '2026-09', net: '-100', income: '0', expenses: '100' }],
      null,
      { USD: '5000', EUR: '700' },
    );
    const result = await service.getMonthlySeries('u1', 3, 'USD');
    expect(result.points.map((p) => p.balance)).toEqual([
      '5000',
      '4900',
      '4900',
    ]);
    // Never income: income and expenses are the ledger's alone.
    expect(result.points.map((p) => p.income)).toEqual(['0', '0', '0']);
    expect(result.points.map((p) => p.expenses)).toEqual(['0', '100', '0']);
  });

  it("adds only the series currency's opening balances, scoped like the ledger query", async () => {
    const { service, prisma } = setup([], null, {
      USD: '5000',
      TND: '1250.500',
    });
    const result = await service.getMonthlySeries('u1', 2, 'TND', 'acc-t');
    expect(result.points.map((p) => p.balance)).toEqual(['1250.5', '1250.5']);
    expect(prisma.account.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', currency: 'TND', id: 'acc-t' },
      }),
    );
  });

  it('adds the opening balance to a cached series too, without caching it', async () => {
    const payload = {
      currency: 'USD',
      points: [{ month: '2026-10', income: '0', expenses: '0', balance: '10' }],
    };
    const { service, prisma } = setup(
      [],
      { payload, expiresAt: new Date(Date.now() + 60_000) },
      { USD: '5000' },
    );
    const result = await service.getMonthlySeries('u1', 1, 'USD');
    expect(result.points[0].balance).toBe('5010');
    expect(payload.points[0].balance).toBe('10');
    expect(prisma.analyticsCache.upsert).not.toHaveBeenCalled();
  });

  it('serves a fresh cached payload without querying', async () => {
    const payload = { currency: 'USD', points: [] };
    const { service, prisma } = setup([], {
      payload,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.getMonthlySeries('u1', 6, 'USD')).resolves.toBe(
      payload,
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('AnalyticsService.getMonthlySeries', () => {
  it('leaves deleted transactions out of income, expenses and the running balance', async () => {
    const queryRaw = jest.fn(async (_sql: Prisma.Sql) => []);
    const prisma = {
      analyticsCache: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => undefined),
      },
      $queryRaw: queryRaw,
      account: {
        aggregate: jest.fn(async () => ({ _sum: { openingBalance: null } })),
      },
    };
    await new AnalyticsService(prisma as never).getMonthlySeries(
      'u1',
      6,
      'USD',
    );
    const sql = queryRaw.mock.calls[0][0].sql;
    // One WHERE filter covers all three sums.
    expect(sql).toContain('t."deletedAt" IS NULL');
    expect(sql).not.toContain('voidedAt');
  });
});

describe('AnalyticsService cache invalidation', () => {
  it('clears the month on an edit, delete or restore, not just on create', async () => {
    const deleteMany = jest.fn(async () => ({ count: 1 }));
    const service = new AnalyticsService({
      analyticsCache: { deleteMany },
    } as never);
    await service.invalidateOnTransaction({
      transactionId: 't1',
      userId: 'u1',
      occurredAt: new Date('2026-03-10T00:00:00Z'),
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'u1',
        OR: expect.arrayContaining([{ cacheKey: 'monthly-summary:v3:2026:3' }]),
      }),
    });
    // The listener is registered for both events.
    const events = Reflect.getMetadata(
      'EVENT_LISTENER_METADATA',
      service.invalidateOnTransaction,
    ) as { event: string }[];
    expect(events.map((e) => e.event).sort()).toEqual([
      'transaction.changed',
      'transaction.created',
    ]);
  });
});

describe('AnalyticsService.getDailySeries', () => {
  function setup(rows: unknown[], openings: Record<string, string> = {}) {
    const queryRaw = jest.fn(async (_sql: Prisma.Sql) => rows);
    const prisma = {
      $queryRaw: queryRaw,
      account: {
        aggregate: jest.fn(
          async ({ where }: { where: { currency: string } }) => ({
            _sum: {
              openingBalance: openings[where.currency]
                ? new Prisma.Decimal(openings[where.currency])
                : null,
            },
          }),
        ),
      },
    };
    return { service: new AnalyticsService(prisma as never), prisma, queryRaw };
  }

  it('returns one point per day, carrying the balance (opening balances and earlier days included) across empty days', async () => {
    const { service } = setup(
      [
        { day: '2026-10-20', net: '200', income: '200', expenses: '0' }, // before the window
        { day: '2026-11-02', net: '-12.5', income: '0', expenses: '12.5' },
        { day: '2026-11-04', net: '30', income: '40', expenses: '10' },
      ],
      { TND: '1000' },
    );
    const result = await service.getDailySeries(
      'u1',
      '2026-11-02',
      4,
      'TND',
      undefined,
      'Africa/Tunis',
    );
    expect(result).toEqual({
      currency: 'TND',
      timeZone: 'Africa/Tunis',
      points: [
        {
          date: '2026-11-02',
          income: '0',
          expenses: '12.5',
          balance: '1187.5',
        },
        { date: '2026-11-03', income: '0', expenses: '0', balance: '1187.5' },
        { date: '2026-11-04', income: '40', expenses: '10', balance: '1217.5' },
        { date: '2026-11-05', income: '0', expenses: '0', balance: '1217.5' },
      ],
    });
  });

  it('crosses a month end on the calendar', async () => {
    const { service } = setup([]);
    const result = await service.getDailySeries('u1', '2026-10-30', 4, 'USD');
    expect(result.points.map((p) => p.date)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('groups by the local day, leaves deleted transactions out and scopes to the account and currency', async () => {
    const { service, queryRaw, prisma } = setup([]);
    await service.getDailySeries(
      'u1',
      '2026-11-02',
      7,
      'TND',
      'acc-1',
      'Africa/Tunis',
    );
    const sql = queryRaw.mock.calls[0][0];
    expect(sql.sql).toContain(`AT TIME ZONE 'UTC') AT TIME ZONE`);
    expect(sql.sql).toContain('"deletedAt" IS NULL');
    expect(sql.sql).toContain('ti."accountId" =');
    expect(sql.values).toEqual(
      expect.arrayContaining([
        'u1',
        'TND',
        'acc-1',
        'Africa/Tunis',
        '2026-11-09',
      ]),
    );
    expect(prisma.account.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', currency: 'TND', id: 'acc-1' },
      }),
    );
  });
});
