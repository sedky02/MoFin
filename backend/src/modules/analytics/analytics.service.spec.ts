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

  const item = (accountId: string, amount: string) => ({ accountId, amount: new Prisma.Decimal(amount) });

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

    const result = (await service.getMonthlySummary('u1', 2026, 7, false, 'acc-a')) as {
      income: string;
      expenses: string;
      categoryBreakdown: { category: string; color: string | null; amount: string }[];
    };

    expect(result.income).toBe('100');
    expect(result.expenses).toBe('0');
    // Scoped to acc-a, so the Groceries item (on acc-b) is filtered out entirely —
    // per-item attribution means it never enters the breakdown at all.
    expect(result.categoryBreakdown).toEqual([]);
    // Filters the transaction query itself, not just post-processing.
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ items: { some: { accountId: 'acc-a' } } }) }),
    );
  });

  it('restricts an all-accounts summary to one currency when asked', async () => {
    const cur = (accountId: string, amount: string, currency: string) => ({
      accountId,
      amount: new Prisma.Decimal(amount),
      currency,
    });
    const transactions = [
      { type: TransactionType.INCOME, category: null, items: [cur('acc-usd', '100', 'USD')] },
      { type: TransactionType.INCOME, category: null, items: [cur('acc-tnd', '900', 'TND')] },
      { type: TransactionType.EXPENSE, category: { name: 'Rent' }, items: [cur('acc-tnd', '300', 'TND')] },
    ];
    const { service, prisma } = makeService(transactions);

    const result = (await service.getMonthlySummary('u1', 2026, 7, false, undefined, 'TND')) as {
      income: string;
      expenses: string;
    };

    expect(result.income).toBe('900');
    expect(result.expenses).toBe('300');
    // Currency is applied per item, so the query itself is not narrowed by it, and the
    // other currency's activity is still reported.
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ items: expect.anything() }) }),
    );
    expect((result as unknown as { activeCurrencies: string[] }).activeCurrencies).toEqual(['TND', 'USD']);
    expect(prisma.analyticsCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_cacheKey: { userId: 'u1', cacheKey: 'monthly-summary:v3:2026:7:cur:TND' } },
      }),
    );
  });

  it('aggregates across all accounts when accountId is omitted', async () => {
    const transactions = [
      { type: TransactionType.INCOME, category: null, items: [item('acc-a', '100')] },
      { type: TransactionType.EXPENSE, category: { name: 'Rent' }, items: [item('acc-b', '40')] },
    ];
    const { service } = makeService(transactions);

    const result = (await service.getMonthlySummary('u1', 2026, 7, false)) as {
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
          { accountId: 'acc-a', amount: new Prisma.Decimal('30'), categoryId: 'cat-groceries', category: { name: 'Groceries', color: '#22c55e' } },
          { accountId: 'acc-a', amount: new Prisma.Decimal('20'), categoryId: 'cat-household', category: { name: 'Household', color: '#3b82f6' } },
        ],
      },
    ];
    const { service } = makeService(transactions);

    const result = (await service.getMonthlySummary('u1', 2026, 7, false)) as {
      expenses: string;
      categoryBreakdown: { category: string; color: string | null; amount: string }[];
    };

    expect(result.expenses).toBe('50');
    expect(result.categoryBreakdown).toEqual(
      expect.arrayContaining([
        { category: 'Groceries', color: '#22c55e', amount: '30' },
        { category: 'Household', color: '#3b82f6', amount: '20' },
      ]),
    );
  });

  it('uses a distinct cache key per account so scoped and unscoped summaries never collide', async () => {
    const { service, prisma } = makeService([]);

    await service.getMonthlySummary('u1', 2026, 7, false, 'acc-a');
    expect(prisma.analyticsCache.findUnique).toHaveBeenCalledWith({
      where: { userId_cacheKey: { userId: 'u1', cacheKey: 'monthly-summary:v3:2026:7:acc-a' } },
    });

    await service.getMonthlySummary('u1', 2026, 7, false);
    expect(prisma.analyticsCache.findUnique).toHaveBeenCalledWith({
      where: { userId_cacheKey: { userId: 'u1', cacheKey: 'monthly-summary:v3:2026:7' } },
    });
  });
});

describe('AnalyticsService.getMonthlySeries', () => {
  function setup(rows: unknown[], cached: unknown = null) {
    const prisma = {
      analyticsCache: { findUnique: jest.fn(async () => cached), upsert: jest.fn(async () => ({})) },
      $queryRaw: jest.fn(async () => rows),
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
      points: { month: string; income: string; expenses: string; balance: string }[];
    };

    expect(result.points).toEqual([
      { month: '2026-08', income: '0', expenses: '100', balance: '900' },
      { month: '2026-09', income: '0', expenses: '0', balance: '900' },
      { month: '2026-10', income: '300', expenses: '50', balance: '1150' },
    ]);
  });

  it('serves a fresh cached payload without querying', async () => {
    const payload = { currency: 'USD', points: [] };
    const { service, prisma } = setup([], { payload, expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.getMonthlySeries('u1', 6, 'USD')).resolves.toBe(payload);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
