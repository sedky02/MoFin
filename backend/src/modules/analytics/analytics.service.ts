import { BadRequestException, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma, TransactionType } from '@prisma/client';
import {
  AccountAccessChangedEvent,
  DomainEvents,
  TransactionChangedEvent,
  TransactionCreatedEvent,
} from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { AccountAccessService } from '../account-access/account-access.service';

type MonthlySeries = {
  currency: string;
  points: {
    month: string;
    income: string;
    expenses: string;
    balance: string;
  }[];
};

type DailySeries = {
  currency: string;
  timeZone: string;
  points: {
    date: string;
    income: string;
    expenses: string;
    /** Closing balance at the end of that day (opening balances included). */
    balance: string;
  }[];
};

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
  ) {}

  /**
   * The account asked for (checked) or every account the caller can reach. Always before a cache
   * read, since a cache entry can outlive the access it was computed with.
   */
  private async accountsInScope(
    userId: string,
    accountId?: string,
  ): Promise<string[]> {
    if (!accountId) return this.access.accessibleAccountIds(userId, 'view');
    await this.access.assertAccess(userId, accountId, 'view');
    return [accountId];
  }

  async getMonthlySummary(
    userId: string,
    year: number,
    month: number,
    refresh = false,
    accountId?: string,
    currency?: string,
  ) {
    // The DTO checks this too; repeated because MCP validates only the raw shape. Without an
    // account to pin the currency, totals would add currencies together.
    if (!accountId && !currency) {
      throw new BadRequestException(
        'currency is required when accountId is not given',
      );
    }
    const accountIds = await this.accountsInScope(userId, accountId);
    const cacheKey = this.monthlySummaryCacheKey(
      year,
      month,
      accountId,
      currency,
    );
    const cached = await this.prisma.analyticsCache.findUnique({
      where: { userId_cacheKey: { userId, cacheKey } },
    });
    if (cached && cached.expiresAt > new Date() && !refresh)
      return cached.payload;

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const transactions = await this.prisma.transaction.findMany({
      where: {
        deletedAt: null,
        occurredAt: { gte: start, lt: end },
        // Currency is applied per item below, not here: the other currencies' activity is still reported.
        items: { some: { accountId: { in: accountIds } } },
      },
      include: { items: { include: { category: true } }, category: true },
    });

    // Currencies with any income/expense this month (within the account scope), so the UI can
    // point at a currency that has activity when the selected one is empty.
    const activeCurrencies = new Set<string>();
    let income = new Prisma.Decimal(0);
    let expenses = new Prisma.Decimal(0);
    type CategoryTotals = Map<
      string,
      { name: string; color: string | null; amount: Prisma.Decimal }
    >;
    const categories: CategoryTotals = new Map();
    const incomeCategories: CategoryTotals = new Map();
    const addToCategory = (
      target: CategoryTotals,
      key: string,
      name: string,
      color: string | null,
      amount: Prisma.Decimal,
    ) => {
      const existing = target.get(key);
      target.set(key, {
        name,
        color,
        amount: (existing?.amount ?? new Prisma.Decimal(0)).plus(amount),
      });
    };

    // A split line carries its own category (blank is "Uncategorized"); only an unsplit transaction
    // falls back to its top-level one, since old splits may carry a stale one.
    type SummaryTransaction = (typeof transactions)[number];
    const addLine = (
      target: CategoryTotals,
      transaction: SummaryTransaction,
      item: SummaryTransaction['items'][number],
    ) => {
      const unsplit = transaction.items.length <= 1;
      const category = item.category ?? (unsplit ? transaction.category : null);
      // By name, not id: across a shared account and a member's own, "Groceries"
      // can be two categories from two people, and it reads as one line.
      const key = category?.name.toLowerCase() ?? 'uncategorized';
      addToCategory(
        target,
        key,
        category?.name ?? 'Uncategorized',
        category?.color ?? null,
        item.amount,
      );
    };

    for (const transaction of transactions) {
      const accountItems = transaction.items.filter((item) =>
        accountIds.includes(item.accountId),
      );
      if (
        transaction.type === TransactionType.INCOME ||
        transaction.type === TransactionType.EXPENSE
      ) {
        for (const item of accountItems)
          if (item.currency) activeCurrencies.add(item.currency);
      }
      const items = accountItems.filter(
        (item) => !currency || item.currency === currency,
      );
      const total = items.reduce(
        (sum, item) => sum.plus(item.amount),
        new Prisma.Decimal(0),
      );
      if (transaction.type === TransactionType.INCOME) {
        income = income.plus(total);
        for (const item of items) addLine(incomeCategories, transaction, item);
      }
      if (transaction.type === TransactionType.EXPENSE) {
        expenses = expenses.plus(total);
        for (const item of items) addLine(categories, transaction, item);
      }
    }

    const toBreakdown = (source: CategoryTotals) =>
      Array.from(source.values()).map(({ name, color, amount }) => ({
        category: name,
        color,
        amount: amount.toString(),
      }));
    const savingsRate = income.greaterThan(0)
      ? income.minus(expenses).div(income).toFixed(4)
      : '0';
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
      create: {
        userId,
        cacheKey,
        payload,
        expiresAt: new Date(Date.now() + 1000 * 60 * 15),
      },
      update: {
        payload,
        computedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 15),
      },
    });

    return payload;
  }

  /** Closing balances include the accounts' opening balances, which never count as income. */
  async getMonthlySeries(
    userId: string,
    months: number,
    currency: string,
    accountId?: string,
  ): Promise<MonthlySeries> {
    const accountIds = await this.accountsInScope(userId, accountId);
    const [series, opening] = await Promise.all([
      this.getLedgerMonthlySeries(
        userId,
        months,
        currency,
        accountIds,
        accountId,
      ),
      this.openingBalanceTotal(currency, accountIds),
    ]);
    if (opening.isZero()) return series;
    return {
      ...series,
      points: series.points.map((point) => ({
        ...point,
        balance: new Prisma.Decimal(point.balance).plus(opening).toString(),
      })),
    };
  }

  /**
   * Days are counted in `timeZone` (the phone's), so a late-evening purchase lands on its own day.
   * Not cached: a week is small and changes with every transaction.
   */
  async getDailySeries(
    userId: string,
    from: string,
    days: number,
    currency: string,
    accountId?: string,
    timeZone = 'UTC',
  ): Promise<DailySeries> {
    const accountIds = await this.accountsInScope(userId, accountId);
    const end = addDays(from, days);
    // occurredAt is a UTC timestamp without zone: read it as UTC, then as the caller's local time.
    const localDay = Prisma.sql`((t."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date`;
    const [rows, opening] = await Promise.all([
      this.prisma.$queryRaw<
        {
          day: string;
          net: Prisma.Decimal | string;
          income: Prisma.Decimal | string;
          expenses: Prisma.Decimal | string;
        }[]
      >(Prisma.sql`
        SELECT to_char(${localDay}, 'YYYY-MM-DD') AS day,
          SUM(CASE WHEN ti.direction = 'CREDIT' THEN ti.amount ELSE -ti.amount END) AS net,
          SUM(CASE WHEN t.type = 'INCOME' THEN ti.amount ELSE 0 END) AS income,
          SUM(CASE WHEN t.type = 'EXPENSE' THEN ti.amount ELSE 0 END) AS expenses
        FROM "TransactionItem" ti
        JOIN "Transaction" t ON t.id = ti."transactionId"
        WHERE ti."accountId" = ANY(${accountIds}::text[])
          AND ti.currency = ${currency}
          AND t."deletedAt" IS NULL
          AND ${localDay} < ${end}::date
        GROUP BY 1
        ORDER BY 1
      `),
      this.openingBalanceTotal(currency, accountIds),
    ]);

    const byDay = new Map(rows.map((r) => [r.day, r]));
    // Everything before the window (and the accounts' opening balances) is where the first day starts.
    let running = rows
      .filter((r) => r.day < from)
      .reduce((sum, r) => sum.plus(new Prisma.Decimal(String(r.net))), opening);

    const points = Array.from({ length: days }, (_, i) => {
      const date = addDays(from, i);
      const row = byDay.get(date);
      running = running.plus(new Prisma.Decimal(String(row?.net ?? 0)));
      return {
        date,
        income: new Prisma.Decimal(String(row?.income ?? 0)).toString(),
        expenses: new Prisma.Decimal(String(row?.expenses ?? 0)).toString(),
        balance: running.toString(),
      };
    });
    return { currency, timeZone, points };
  }

  /** Read fresh rather than cached with the series, so editing an opening balance shows up at once. */
  private async openingBalanceTotal(
    currency: string,
    accountIds: string[],
  ): Promise<Prisma.Decimal> {
    const { _sum } = await this.prisma.account.aggregate({
      where: { id: { in: accountIds }, currency },
      _sum: { openingBalance: true },
    });
    return _sum.openingBalance ?? new Prisma.Decimal(0);
  }

  /**
   * One grouped query over the whole history, not N month queries. Cached 15 min and cleared on any
   * transaction change (a back-dated entry shifts every later closing balance).
   */
  private async getLedgerMonthlySeries(
    userId: string,
    months: number,
    currency: string,
    accountIds: string[],
    accountId?: string,
  ): Promise<MonthlySeries> {
    const now = new Date();
    const first = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const cacheKey = `monthly-series:v1:${months}:${currency}:${accountId ?? 'all'}:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;

    const cached = await this.prisma.analyticsCache.findUnique({
      where: { userId_cacheKey: { userId, cacheKey } },
    });
    if (cached && cached.expiresAt > new Date())
      return cached.payload as unknown as MonthlySeries;

    const rows = await this.prisma.$queryRaw<
      {
        month: string;
        net: Prisma.Decimal | string;
        income: Prisma.Decimal | string;
        expenses: Prisma.Decimal | string;
      }[]
    >(Prisma.sql`
      SELECT to_char(date_trunc('month', t."occurredAt"), 'YYYY-MM') AS month,
        SUM(CASE WHEN ti.direction = 'CREDIT' THEN ti.amount ELSE -ti.amount END) AS net,
        SUM(CASE WHEN t.type = 'INCOME' THEN ti.amount ELSE 0 END) AS income,
        SUM(CASE WHEN t.type = 'EXPENSE' THEN ti.amount ELSE 0 END) AS expenses
      FROM "TransactionItem" ti
      JOIN "Transaction" t ON t.id = ti."transactionId"
      WHERE ti."accountId" = ANY(${accountIds}::text[])
        AND ti.currency = ${currency}
        AND t."deletedAt" IS NULL
        AND t."occurredAt" < ${end}
      GROUP BY 1
      ORDER BY 1
    `);

    const byMonth = new Map(rows.map((r) => [r.month, r]));
    const key = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const firstKey = key(first);

    // Everything before the window is just an opening balance.
    let running = rows
      .filter((r) => r.month < firstKey)
      .reduce(
        (sum, r) => sum.plus(new Prisma.Decimal(String(r.net))),
        new Prisma.Decimal(0),
      );

    const points = Array.from({ length: months }, (_, i) => {
      const month = key(
        new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)),
      );
      const row = byMonth.get(month);
      running = running.plus(new Prisma.Decimal(String(row?.net ?? 0)));
      return {
        month,
        income: new Prisma.Decimal(String(row?.income ?? 0)).toString(),
        expenses: new Prisma.Decimal(String(row?.expenses ?? 0)).toString(),
        balance: running.toString(),
      };
    });

    const payload: MonthlySeries = { currency, points };
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15);
    await this.prisma.analyticsCache.upsert({
      where: { userId_cacheKey: { userId, cacheKey } },
      create: { userId, cacheKey, payload, expiresAt },
      update: { payload, computedAt: new Date(), expiresAt },
    });
    return payload;
  }

  // v3: payload gained `incomeBreakdown`; bumped so older cache rows aren't served stale.
  private monthlySummaryCacheKey(
    year: number,
    month: number,
    accountId?: string,
    currency?: string,
  ): string {
    // Every variant starts with `<base>:` (except the bare base), which invalidation relies on.
    return `monthly-summary:v3:${year}:${month}${accountId ? `:${accountId}` : ''}${currency ? `:cur:${currency}` : ''}`;
  }

  @OnEvent(DomainEvents.AccountAccessChanged)
  async invalidateOnAccessChange(event: AccountAccessChangedEvent) {
    await this.prisma.analyticsCache.deleteMany({
      where: { userId: { in: event.userIds } },
    });
  }

  @OnEvent(DomainEvents.TransactionCreated)
  @OnEvent(DomainEvents.TransactionChanged)
  async invalidateOnTransaction(
    event: TransactionCreatedEvent | TransactionChangedEvent,
  ) {
    const year = event.occurredAt.getUTCFullYear();
    const month = event.occurredAt.getUTCMonth() + 1;
    const base = this.monthlySummaryCacheKey(year, month);
    // Clears the unscoped and every account-scoped entry for the month (over-invalidating is
    // cheap). `${base}:` avoids "month 1" matching 10/11/12.
    await this.prisma.analyticsCache.deleteMany({
      where: {
        // Everyone on the accounts it touched, not just who changed it.
        userId: {
          in: [
            event.userId,
            ...(await this.access.usersWithAccess(event.accountIds)),
          ],
        },
        OR: [
          { cacheKey: base },
          { cacheKey: { startsWith: `${base}:` } },
          // Any change can move every later month's closing balance, so drop all series.
          { cacheKey: { startsWith: 'monthly-series:' } },
        ],
      },
    });
  }
}
