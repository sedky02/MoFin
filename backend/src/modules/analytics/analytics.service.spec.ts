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
      where: { userId_cacheKey: { userId: 'u1', cacheKey: 'monthly-summary:v2:2026:7:acc-a' } },
    });

    await service.getMonthlySummary('u1', 2026, 7, false);
    expect(prisma.analyticsCache.findUnique).toHaveBeenCalledWith({
      where: { userId_cacheKey: { userId: 'u1', cacheKey: 'monthly-summary:v2:2026:7' } },
    });
  });
});
