import { GoalRecurrenceUnit, GoalStatus, GoalType, Prisma } from '@prisma/client';
import { GoalsService, resolvePeriodBounds } from './goals.service';

describe('GoalsService', () => {
  function makeService() {
    return new GoalsService({} as never, {} as never);
  }

  describe('evaluateStatus', () => {
    const target = new Prisma.Decimal('100');

    it('BALANCE: achieves as soon as progress reaches target, even mid-period', () => {
      const service = makeService();
      const status = service.evaluateStatus(GoalType.BALANCE, new Prisma.Decimal('100'), target, false, GoalStatus.IN_PROGRESS);
      expect(status).toBe(GoalStatus.ACHIEVED);
    });

    it('BALANCE: stays IN_PROGRESS mid-period below target', () => {
      const service = makeService();
      const status = service.evaluateStatus(GoalType.BALANCE, new Prisma.Decimal('50'), target, false, GoalStatus.IN_PROGRESS);
      expect(status).toBe(GoalStatus.IN_PROGRESS);
    });

    it('BALANCE: fails once period ends below target', () => {
      const service = makeService();
      const status = service.evaluateStatus(GoalType.BALANCE, new Prisma.Decimal('99'), target, true, GoalStatus.IN_PROGRESS);
      expect(status).toBe(GoalStatus.FAILED);
    });

    it('BALANCE: stays ACHIEVED even if progress later dips below target', () => {
      const service = makeService();
      const status = service.evaluateStatus(GoalType.BALANCE, new Prisma.Decimal('10'), target, false, GoalStatus.ACHIEVED);
      expect(status).toBe(GoalStatus.ACHIEVED);
    });

    it('INCOME: behaves like BALANCE (reach checkpoint)', () => {
      const service = makeService();
      expect(service.evaluateStatus(GoalType.INCOME, new Prisma.Decimal('100'), target, false, GoalStatus.IN_PROGRESS)).toBe(
        GoalStatus.ACHIEVED,
      );
    });

    it('EXPENSE: fails as soon as spending exceeds target, before period end', () => {
      const service = makeService();
      const status = service.evaluateStatus(GoalType.EXPENSE, new Prisma.Decimal('101'), target, false, GoalStatus.IN_PROGRESS);
      expect(status).toBe(GoalStatus.FAILED);
    });

    it('EXPENSE: stays IN_PROGRESS mid-period while under target', () => {
      const service = makeService();
      const status = service.evaluateStatus(GoalType.EXPENSE, new Prisma.Decimal('50'), target, false, GoalStatus.IN_PROGRESS);
      expect(status).toBe(GoalStatus.IN_PROGRESS);
    });

    it('EXPENSE: only achieves once period ends while under target', () => {
      const service = makeService();
      const status = service.evaluateStatus(GoalType.EXPENSE, new Prisma.Decimal('50'), target, true, GoalStatus.IN_PROGRESS);
      expect(status).toBe(GoalStatus.ACHIEVED);
    });
  });

  describe('computeProgressAmount', () => {
    // BALANCE nets CREDIT/DEBIT via a DB groupBy instead of loading every row.
    function makeServiceWithGroupedRows(rows: unknown[]) {
      const groupBy = jest.fn((_args: unknown) => Promise.resolve(rows));
      const prisma = { transactionItem: { groupBy } };
      return { service: new GoalsService(prisma as never, {} as never), groupBy };
    }

    // INCOME/EXPENSE just need a total, via a DB aggregate.
    function makeServiceWithAggregate(sum: Prisma.Decimal | null) {
      const aggregate = jest.fn((_args: unknown) => Promise.resolve({ _sum: { amount: sum } }));
      const prisma = { transactionItem: { aggregate } };
      return { service: new GoalsService(prisma as never, {} as never), aggregate };
    }

    it('BALANCE nets CREDIT/DEBIT from grouped DB rows, up to the boundary regardless of periodStart', async () => {
      const rows = [
        { direction: 'CREDIT', _sum: { amount: new Prisma.Decimal('100') } },
        { direction: 'DEBIT', _sum: { amount: new Prisma.Decimal('30') } },
      ];
      const { service, groupBy } = makeServiceWithGroupedRows(rows);
      const result = await service.computeProgressAmount(
        { type: GoalType.BALANCE, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      expect(result.toString()).toBe('70');
      // userId included as defence in depth (audit PERF-XX).
      expect(groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', accountId: 'a1' }) }),
      );
      // Filtered by the transaction's occurredAt (when the money moved), not
      // the ledger row's createdAt — must agree with AnalyticsService's
      // monthly summary on which period a back-dated entry belongs to
      // (audit DATA-XX).
      const call = groupBy.mock.calls[0][0] as { where: { createdAt?: unknown; transaction?: { occurredAt?: unknown } } };
      expect(call.where.createdAt).toBeUndefined();
      expect(call.where.transaction?.occurredAt).toEqual({ lte: new Date('2026-01-15') });
    });

    it('BALANCE treats a group with no matching rows (null _sum) as zero', async () => {
      const { service } = makeServiceWithGroupedRows([{ direction: 'CREDIT', _sum: { amount: null } }]);
      const result = await service.computeProgressAmount(
        { type: GoalType.BALANCE, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      expect(result.toString()).toBe('0');
    });

    it('INCOME sums matching items within the period via a DB aggregate', async () => {
      const { service, aggregate } = makeServiceWithAggregate(new Prisma.Decimal('200'));
      const result = await service.computeProgressAmount(
        { type: GoalType.INCOME, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      expect(result.toString()).toBe('200');
      expect(aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', accountId: 'a1' }) }),
      );
      // Same occurredAt-vs-createdAt standardization as the BALANCE case above.
      const call = aggregate.mock.calls[0][0] as {
        where: { createdAt?: unknown; transaction?: { occurredAt?: unknown; type?: unknown; category?: unknown } };
      };
      expect(call.where.createdAt).toBeUndefined();
      expect(call.where.transaction?.occurredAt).toEqual({
        gte: new Date('2026-01-01'),
        lte: new Date('2026-01-15'),
      });
      // Matches the transaction's own `type` (like AnalyticsService does), not
      // a category's type — category never gates whether an item counts, so
      // uncategorized income/expense transactions are no longer excluded
      // (audit DATA-XX).
      expect(call.where.transaction?.type).toBe('INCOME');
      expect(call.where.transaction?.category).toBeUndefined();
    });

    it('EXPENSE filters by the transaction type EXPENSE, not by category', async () => {
      const { service, aggregate } = makeServiceWithAggregate(new Prisma.Decimal('50'));
      await service.computeProgressAmount(
        { type: GoalType.EXPENSE, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      const call = aggregate.mock.calls[0][0] as { where: { transaction?: { type?: unknown } } };
      expect(call.where.transaction?.type).toBe('EXPENSE');
    });

    it('INCOME/EXPENSE treats no matching rows (null sum) as zero', async () => {
      const { service } = makeServiceWithAggregate(null);
      const result = await service.computeProgressAmount(
        { type: GoalType.EXPENSE, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      expect(result.toString()).toBe('0');
    });
  });

  describe('list', () => {
    function makeServiceWithPrisma() {
      const prisma = { goal: { findMany: jest.fn(async () => []) } };
      return { service: new GoalsService(prisma as never, {} as never), prisma };
    }

    it('defaults to active goals only (archivedAt: null)', async () => {
      const { service, prisma } = makeServiceWithPrisma();
      await service.list('u1');
      expect(prisma.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', archivedAt: null } }),
      );
    });

    it('filters to archived goals only when status=archived', async () => {
      const { service, prisma } = makeServiceWithPrisma();
      await service.list('u1', 'archived');
      expect(prisma.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', archivedAt: { not: null } } }),
      );
    });

    it('applies no archived filter when status=all', async () => {
      const { service, prisma } = makeServiceWithPrisma();
      await service.list('u1', 'all');
      expect(prisma.goal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
    });
  });

  describe('assertOwned', () => {
    it('finds an archived goal — stopping a goal must not hide its history', async () => {
      const goal = { id: 'g1', userId: 'u1', archivedAt: new Date() };
      const prisma = { goal: { findFirst: jest.fn(async () => goal) } };
      const service = new GoalsService(prisma as never, {} as never);

      const result = await service.assertOwned('u1', 'g1');

      expect(result).toBe(goal);
      expect(prisma.goal.findFirst).toHaveBeenCalledWith({ where: { id: 'g1', userId: 'u1' } });
    });
  });

  describe('resolvePeriodBounds', () => {
    // UTC throughout (audit DATA-XX): a local-time constructor here would put
    // a transaction near midnight on the last day of the month in a different
    // period depending only on the server's TZ, silently disagreeing with
    // AnalyticsService.getMonthlySummary (which is UTC) in production.
    it('MONTH: resolves calendar-month bounds in UTC regardless of server TZ', () => {
      // 23:30 UTC on Jan 31st — in a server TZ ahead of UTC (e.g. UTC+1),
      // local-time construction would wrongly place this in February.
      const anchor = new Date(Date.UTC(2026, 0, 31, 23, 30));
      const [start, end] = resolvePeriodBounds(anchor, GoalRecurrenceUnit.MONTH);
      expect(start).toEqual(new Date(Date.UTC(2026, 0, 1)));
      expect(end).toEqual(new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999)));
    });

    it('MONTH: December rolls the period end into January of the next year, not local-time February', () => {
      const anchor = new Date(Date.UTC(2026, 11, 15));
      const [start, end] = resolvePeriodBounds(anchor, GoalRecurrenceUnit.MONTH);
      expect(start).toEqual(new Date(Date.UTC(2026, 11, 1)));
      expect(end).toEqual(new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)));
    });

    it('YEAR: resolves calendar-year bounds in UTC', () => {
      const anchor = new Date(Date.UTC(2026, 5, 15, 23, 30));
      const [start, end] = resolvePeriodBounds(anchor, GoalRecurrenceUnit.YEAR);
      expect(start).toEqual(new Date(Date.UTC(2026, 0, 1)));
      expect(end).toEqual(new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)));
    });
  });
});
