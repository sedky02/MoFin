import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LedgerDirection, Prisma, TransactionType } from '@prisma/client';
import { DomainEvents, TransactionCreatedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthlySummary(userId: string, year: number, month: number, refresh = false, accountId?: string, currency?: string) {
    const cacheKey = this.monthlySummaryCacheKey(year, month, accountId, currency);
    const cached = await this.prisma.analyticsCache.findUnique({ where: { userId_cacheKey: { userId, cacheKey } } });
    if (cached && cached.expiresAt > new Date() && !refresh) return cached.payload;

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    // Scoping by userId already prevents cross-user leakage even if accountId belongs to
    // someone else's account: no transaction of ours will ever carry their account's items.
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        // A voided transaction and its mirror reversal cancel out — neither is income/spending.
        voidedAt: null,
        reversesTransactionId: null,
        occurredAt: { gte: start, lt: end },
        // Currency is applied per item below, not here: the other currencies' activity is still reported.
        ...(accountId ? { items: { some: { accountId } } } : {}),
      },
      include: { items: { include: { category: true } }, category: true }
    });

    // Currencies with any income/expense this month (within the account scope), so the UI can
    // point at a currency that has activity when the selected one is empty.
    const activeCurrencies = new Set<string>();
    let income = new Prisma.Decimal(0);
    let expenses = new Prisma.Decimal(0);
    type CategoryTotals = Map<string, { name: string; color: string | null; amount: Prisma.Decimal }>;
    const categories: CategoryTotals = new Map();
    const incomeCategories: CategoryTotals = new Map();
    const addToCategory = (target: CategoryTotals, key: string, name: string, color: string | null, amount: Prisma.Decimal) => {
      const existing = target.get(key);
      target.set(key, { name, color, amount: (existing?.amount ?? new Prisma.Decimal(0)).plus(amount) });
    };

    for (const transaction of transactions) {
      // INCOME/EXPENSE are single-sided, so filtering items down to `accountId` only matters
      // when it's set — otherwise it's every (single) item on the transaction either way.
      const accountItems = transaction.items.filter((item) => !accountId || item.accountId === accountId);
      if (transaction.type === TransactionType.INCOME || transaction.type === TransactionType.EXPENSE) {
        for (const item of accountItems) if (item.currency) activeCurrencies.add(item.currency);
      }
      const items = accountItems.filter((item) => !currency || item.currency === currency);
      const total = items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      if (transaction.type === TransactionType.INCOME) {
        income = income.plus(total);
        for (const item of items) {
          const category = item.category ?? transaction.category;
          const key = item.categoryId ?? transaction.categoryId ?? 'uncategorized';
          addToCategory(incomeCategories, key, category?.name ?? 'Uncategorized', category?.color ?? null, item.amount);
        }
      }
      if (transaction.type === TransactionType.EXPENSE) {
        expenses = expenses.plus(total);
        // Split items carry their own category; unsplit items fall back to the
        // transaction's category so pre-split transactions attribute the same way.
        for (const item of items) {
          const category = item.category ?? transaction.category;
          const key = item.categoryId ?? transaction.categoryId ?? 'uncategorized';
          const name = category?.name ?? 'Uncategorized';
          const color = category?.color ?? null;
          addToCategory(categories, key, name, color, item.amount);
        }
      }
    }

    const toBreakdown = (source: CategoryTotals) =>
      Array.from(source.values()).map(({ name, color, amount }) => ({
        category: name,
        color,
        amount: amount.toString()
      }));
    const savingsRate = income.greaterThan(0) ? income.minus(expenses).div(income).toFixed(4) : '0';
    const payload = {
      year,
      month,
      income: income.toString(),
      expenses: expenses.toString(),
      savingsRate,
      activeCurrencies: [...activeCurrencies].sort(),
      categoryBreakdown: toBreakdown(categories),
      incomeBreakdown: toBreakdown(incomeCategories),
    };

    await this.prisma.analyticsCache.upsert({
      where: { userId_cacheKey: { userId, cacheKey } },
      create: { userId, cacheKey, payload, expiresAt: new Date(Date.now() + 1000 * 60 * 15) },
      update: { payload, computedAt: new Date(), expiresAt: new Date(Date.now() + 1000 * 60 * 15) }
    });

    return payload;
  }

  /**
   * Income, expenses and closing balance for each of the last `months` calendar
   * months (UTC, oldest first), in one currency. One grouped query over the whole
   * history — not N month queries and not row-by-row summing in Node. Income and
   * expenses skip voided transactions and their reversals (they cancel out); the
   * balance includes both so it matches the ledger exactly. Cached 15 min and
   * cleared whenever any transaction changes (a back-dated entry shifts every
   * later month's closing balance).
   */
  async getMonthlySeries(userId: string, months: number, currency: string, accountId?: string) {
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const cacheKey = `monthly-series:v1:${months}:${currency}:${accountId ?? 'all'}:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;

    const cached = await this.prisma.analyticsCache.findUnique({ where: { userId_cacheKey: { userId, cacheKey } } });
    if (cached && cached.expiresAt > new Date()) return cached.payload;

    const rows = await this.prisma.$queryRaw<
      { month: string; net: Prisma.Decimal | string; income: Prisma.Decimal | string; expenses: Prisma.Decimal | string }[]
    >(Prisma.sql`
      SELECT to_char(date_trunc('month', t."occurredAt"), 'YYYY-MM') AS month,
        SUM(CASE WHEN ti.direction = 'CREDIT' THEN ti.amount ELSE -ti.amount END) AS net,
        SUM(CASE WHEN t.type = 'INCOME' AND t."voidedAt" IS NULL AND t."reversesTransactionId" IS NULL THEN ti.amount ELSE 0 END) AS income,
        SUM(CASE WHEN t.type = 'EXPENSE' AND t."voidedAt" IS NULL AND t."reversesTransactionId" IS NULL THEN ti.amount ELSE 0 END) AS expenses
      FROM "TransactionItem" ti
      JOIN "Transaction" t ON t.id = ti."transactionId"
      WHERE ti."userId" = ${userId}
        AND ti.currency = ${currency}
        AND t."occurredAt" < ${end}
        ${accountId ? Prisma.sql`AND ti."accountId" = ${accountId}` : Prisma.empty}
      GROUP BY 1
      ORDER BY 1
    `);

    const byMonth = new Map(rows.map((r) => [r.month, r]));
    const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const firstKey = key(first);

    // Everything before the window is just an opening balance.
    let running = rows
      .filter((r) => r.month < firstKey)
      .reduce((sum, r) => sum.plus(new Prisma.Decimal(String(r.net))), new Prisma.Decimal(0));

    const points = Array.from({ length: months }, (_, i) => {
      const month = key(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)));
      const row = byMonth.get(month);
      running = running.plus(new Prisma.Decimal(String(row?.net ?? 0)));
      return {
        month,
        income: new Prisma.Decimal(String(row?.income ?? 0)).toString(),
        expenses: new Prisma.Decimal(String(row?.expenses ?? 0)).toString(),
        balance: running.toString(),
      };
    });

    const payload = { currency, points };
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15);
    await this.prisma.analyticsCache.upsert({
      where: { userId_cacheKey: { userId, cacheKey } },
      create: { userId, cacheKey, payload, expiresAt },
      update: { payload, computedAt: new Date(), expiresAt },
    });
    return payload;
  }

  // v3: payload gained `incomeBreakdown` — bump so pre-existing cache rows
  // (missing it) aren't served stale after this change deploys.
  private monthlySummaryCacheKey(year: number, month: number, accountId?: string, currency?: string): string {
    // Every variant starts with `<base>:` (except the bare base), which invalidation relies on.
    return `monthly-summary:v3:${year}:${month}${accountId ? `:${accountId}` : ''}${currency ? `:cur:${currency}` : ''}`;
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
      where: {
        userId: event.userId,
        OR: [
          { cacheKey: base },
          { cacheKey: { startsWith: `${base}:` } },
          // Any change can move every later month's closing balance, so drop all series.
          { cacheKey: { startsWith: 'monthly-series:' } },
        ],
      }
    });
  }
}
