import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LedgerDirection, Prisma, TransactionType } from '@prisma/client';
import { DomainEvents, TransactionCreatedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthlySummary(userId: string, year: number, month: number, refresh = false) {
    const cacheKey = `monthly-summary:${year}:${month}`;
    const cached = await this.prisma.analyticsCache.findUnique({ where: { userId_cacheKey: { userId, cacheKey } } });
    if (cached && cached.expiresAt > new Date() && !refresh) return cached.payload;

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const transactions = await this.prisma.transaction.findMany({
      where: { userId, occurredAt: { gte: start, lt: end } },
      include: { items: true, category: true }
    });

    let income = new Prisma.Decimal(0);
    let expenses = new Prisma.Decimal(0);
    const categories = new Map<string, Prisma.Decimal>();

    for (const transaction of transactions) {
      const total = transaction.items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      if (transaction.type === TransactionType.INCOME) income = income.plus(total);
      if (transaction.type === TransactionType.EXPENSE) {
        expenses = expenses.plus(total);
        const key = transaction.category?.name ?? 'Uncategorized';
        categories.set(key, (categories.get(key) ?? new Prisma.Decimal(0)).plus(total));
      }
    }

    const savingsRate = income.greaterThan(0) ? income.minus(expenses).div(income).toFixed(4) : '0';
    const payload = {
      year,
      month,
      income: income.toString(),
      expenses: expenses.toString(),
      savingsRate,
      categoryBreakdown: Array.from(categories.entries()).map(([category, amount]) => ({
        category,
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

  @OnEvent(DomainEvents.TransactionCreated)
  async invalidateOnTransaction(event: TransactionCreatedEvent) {
    const year = event.occurredAt.getUTCFullYear();
    const month = event.occurredAt.getUTCMonth() + 1;
    await this.prisma.analyticsCache.deleteMany({
      where: { userId: event.userId, cacheKey: `monthly-summary:${year}:${month}` }
    });
  }
}
