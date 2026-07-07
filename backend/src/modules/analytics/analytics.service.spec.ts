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
        category: { name: 'Groceries' },
        items: [item('acc-b', '40')],
      },
    ];
    const { service, prisma } = makeService(transactions);

    const result = (await service.getMonthlySummary('u1', 2026, 7, false, 'acc-a')) as {
      income: string;
      expenses: string;
    };

    expect(result.income).toBe('100');
    expect(result.expenses).toBe('0');
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

  it('uses a distinct cache key per account so scoped and unscoped summaries never collide', async () => {
    const { service, prisma } = makeService([]);

    await service.getMonthlySummary('u1', 2026, 7, false, 'acc-a');
    expect(prisma.analyticsCache.findUnique).toHaveBeenCalledWith({
      where: { userId_cacheKey: { userId: 'u1', cacheKey: 'monthly-summary:2026:7:acc-a' } },
    });

    await service.getMonthlySummary('u1', 2026, 7, false);
    expect(prisma.analyticsCache.findUnique).toHaveBeenCalledWith({
      where: { userId_cacheKey: { userId: 'u1', cacheKey: 'monthly-summary:2026:7' } },
    });
  });
});
