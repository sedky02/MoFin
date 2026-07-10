import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LedgerDirection, Prisma, TransactionType } from '@prisma/client';
import { DomainEvents, TransactionCreatedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthlySummary(userId: string, year: number, month: number, refresh = false, accountId?: string) {
    const cacheKey = this.monthlySummaryCacheKey(year, month, accountId);
    const cached = await this.prisma.analyticsCache.findUnique({ where: { userId_cacheKey: { userId, cacheKey } } });
    if (cached && cached.expiresAt > new Date() && !refresh) return cached.payload;

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    // Scoping by userId already prevents cross-user leakage even if accountId belongs to
    // someone else's account: no transaction of ours will ever carry their account's items.
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: { gte: start, lt: end },
        ...(accountId ? { items: { some: { accountId } } } : {}),
      },
      include: { items: { include: { category: true } }, category: true }
    });

    let income = new Prisma.Decimal(0);
    let expenses = new Prisma.Decimal(0);
    const categories = new Map<string, { name: string; color: string | null; amount: Prisma.Decimal }>();

    for (const transaction of transactions) {
      // INCOME/EXPENSE are single-sided, so filtering items down to `accountId` only matters
      // when it's set — otherwise it's every (single) item on the transaction either way.
      const items = accountId ? transaction.items.filter((item) => item.accountId === accountId) : transaction.items;
      const total = items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      if (transaction.type === TransactionType.INCOME) income = income.plus(total);
      if (transaction.type === TransactionType.EXPENSE) {
        expenses = expenses.plus(total);
        // Split items carry their own category; unsplit items fall back to the
        // transaction's category so pre-split transactions attribute the same way.
        for (const item of items) {
          const category = item.category ?? transaction.category;
          const key = item.categoryId ?? transaction.categoryId ?? 'uncategorized';
          const name = category?.name ?? 'Uncategorized';
          const color = category?.color ?? null;
          const existing = categories.get(key);
          categories.set(key, { name, color, amount: (existing?.amount ?? new Prisma.Decimal(0)).plus(item.amount) });
        }
      }
    }

    const savingsRate = income.greaterThan(0) ? income.minus(expenses).div(income).toFixed(4) : '0';
    const payload = {
      year,
      month,
      income: income.toString(),
      expenses: expenses.toString(),
      savingsRate,
      categoryBreakdown: Array.from(categories.values()).map(({ name, color, amount }) => ({
        category: name,
        color,
        amount: amount.toString()
      }))
    };

    await this.prisma.analyticsCache.upsert({
      where: { userId_cacheKey: { userId, cacheKey } },
      create: { userId, cacheKey, payload, expiresAt: new Date(Date.now() + 1000 * 60 * 15) },
      update: { payload, computedAt: new Date(), expiresAt: new Date(Date.now() + 1000 * 60 * 15) }
    });

    return payload;
  }

  // v2: categoryBreakdown now carries each category's color — bump so pre-existing
  // cache rows (missing `color`) aren't served stale after this change deploys.
  private monthlySummaryCacheKey(year: number, month: number, accountId?: string): string {
    return accountId ? `monthly-summary:v2:${year}:${month}:${accountId}` : `monthly-summary:v2:${year}:${month}`;
  }

  @OnEvent(DomainEvents.TransactionCreated)
  async invalidateOnTransaction(event: TransactionCreatedEvent) {
    const year = event.occurredAt.getUTCFullYear();
    const month = event.occurredAt.getUTCMonth() + 1;
    const base = this.monthlySummaryCacheKey(year, month);
    // Clears both the unscoped and every account-scoped cache entry for this month at once —
    // cheap to over-invalidate a cache, and we don't know which accounts this transaction's
    // items touched without an extra query. Matching `${base}:` (not a bare startsWith(base))
    // avoids "month 1" wrongly matching "month 10/11/12".
    await this.prisma.analyticsCache.deleteMany({
      where: { userId: event.userId, OR: [{ cacheKey: base }, { cacheKey: { startsWith: `${base}:` } }] }
    });
  }
}
