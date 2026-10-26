import {
  GoalRecurrenceUnit,
  GoalStatus,
  GoalType,
  Prisma,
} from '@prisma/client';
import { createGoalSchema } from './dto/goals.dto';
import { GoalsService, resolvePeriodBounds } from './goals.service';

describe('GoalsService', () => {
  function makeService() {
    return new GoalsService({} as never, {} as never);
  }

  describe('evaluateStatus', () => {
    const target = new Prisma.Decimal('100');

    it('BALANCE: achieves as soon as progress reaches target, even mid-period', () => {
      const service = makeService();
      const status = service.evaluateStatus(
        GoalType.BALANCE,
        new Prisma.Decimal('100'),
        target,
        false,
        GoalStatus.IN_PROGRESS,
      );
      expect(status).toBe(GoalStatus.ACHIEVED);
    });

    it('BALANCE: stays IN_PROGRESS mid-period below target', () => {
      const service = makeService();
      const status = service.evaluateStatus(
        GoalType.BALANCE,
        new Prisma.Decimal('50'),
        target,
        false,
        GoalStatus.IN_PROGRESS,
      );
      expect(status).toBe(GoalStatus.IN_PROGRESS);
    });

    it('BALANCE: fails once period ends below target', () => {
      const service = makeService();
      const status = service.evaluateStatus(
        GoalType.BALANCE,
        new Prisma.Decimal('99'),
        target,
        true,
        GoalStatus.IN_PROGRESS,
      );
      expect(status).toBe(GoalStatus.FAILED);
    });

    it('BALANCE: stays ACHIEVED even if progress later dips below target', () => {
      const service = makeService();
      const status = service.evaluateStatus(
        GoalType.BALANCE,
        new Prisma.Decimal('10'),
        target,
        false,
        GoalStatus.ACHIEVED,
      );
      expect(status).toBe(GoalStatus.ACHIEVED);
    });

    it('INCOME: behaves like BALANCE (reach checkpoint)', () => {
      const service = makeService();
      expect(
        service.evaluateStatus(
          GoalType.INCOME,
          new Prisma.Decimal('100'),
          target,
          false,
          GoalStatus.IN_PROGRESS,
        ),
      ).toBe(GoalStatus.ACHIEVED);
    });

    it('EXPENSE: fails as soon as spending exceeds target, before period end', () => {
      const service = makeService();
      const status = service.evaluateStatus(
        GoalType.EXPENSE,
        new Prisma.Decimal('101'),
        target,
        false,
        GoalStatus.IN_PROGRESS,
      );
      expect(status).toBe(GoalStatus.FAILED);
    });

    it('EXPENSE: stays IN_PROGRESS mid-period while under target', () => {
      const service = makeService();
      const status = service.evaluateStatus(
        GoalType.EXPENSE,
        new Prisma.Decimal('50'),
        target,
        false,
        GoalStatus.IN_PROGRESS,
      );
      expect(status).toBe(GoalStatus.IN_PROGRESS);
    });

    it('EXPENSE: only achieves once period ends while under target', () => {
      const service = makeService();
      const status = service.evaluateStatus(
        GoalType.EXPENSE,
        new Prisma.Decimal('50'),
        target,
        true,
        GoalStatus.IN_PROGRESS,
      );
      expect(status).toBe(GoalStatus.ACHIEVED);
    });
  });

  describe('computeProgressAmount', () => {
    // BALANCE nets CREDIT/DEBIT via a DB groupBy instead of loading every row.
    function makeServiceWithGroupedRows(rows: unknown[], openingBalance = '0') {
      const groupBy = jest.fn((_args: unknown) => Promise.resolve(rows));
      const findFirst = jest.fn((_args: unknown) =>
        Promise.resolve({ openingBalance: new Prisma.Decimal(openingBalance) }),
      );
      const prisma = { transactionItem: { groupBy }, account: { findFirst } };
      return {
        service: new GoalsService(prisma as never, {} as never),
        groupBy,
        findFirst,
      };
    }

    // INCOME/EXPENSE just need a total, via a DB aggregate. `account` is there
    // to show an opening balance is never read for them.
    function makeServiceWithAggregate(sum: Prisma.Decimal | null) {
      const aggregate = jest.fn((_args: unknown) =>
        Promise.resolve({ _sum: { amount: sum } }),
      );
      const findFirst = jest.fn((_args: unknown) =>
        Promise.resolve({ openingBalance: new Prisma.Decimal('5000') }),
      );
      const prisma = { transactionItem: { aggregate }, account: { findFirst } };
      return {
        service: new GoalsService(prisma as never, {} as never),
        aggregate,
        findFirst,
      };
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
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1', accountId: 'a1' }),
        }),
      );
      // Filtered by the transaction's occurredAt (when the money moved), not
      // the ledger row's createdAt — must agree with AnalyticsService's
      // monthly summary on which period a back-dated entry belongs to
      // (audit DATA-XX).
      const call = groupBy.mock.calls[0][0] as {
        where: { createdAt?: unknown; transaction?: { occurredAt?: unknown } };
      };
      expect(
        (call.where.transaction as { deletedAt?: unknown }).deletedAt,
      ).toBeNull();
      expect(call.where.createdAt).toBeUndefined();
      expect(call.where.transaction?.occurredAt).toEqual({
        lte: new Date('2026-01-15'),
      });
    });

    it('BALANCE treats a group with no matching rows (null _sum) as zero', async () => {
      const { service } = makeServiceWithGroupedRows([
        { direction: 'CREDIT', _sum: { amount: null } },
      ]);
      const result = await service.computeProgressAmount(
        { type: GoalType.BALANCE, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      expect(result.toString()).toBe('0');
    });

    it("BALANCE starts from the account's opening balance", async () => {
      const rows = [
        { direction: 'DEBIT', _sum: { amount: new Prisma.Decimal('200') } },
      ];
      const { service, findFirst } = makeServiceWithGroupedRows(rows, '5000');
      const result = await service.computeProgressAmount(
        { type: GoalType.BALANCE, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      expect(result.toString()).toBe('4800');
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a1', userId: 'u1' } }),
      );
    });

    it('BALANCE counts the opening balance even before any entry', async () => {
      const { service } = makeServiceWithGroupedRows([], '5000');
      const result = await service.computeProgressAmount(
        { type: GoalType.BALANCE, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-01'),
      );
      expect(result.toString()).toBe('5000');
    });

    it("INCOME and EXPENSE leave the account's opening balance out", async () => {
      for (const type of [GoalType.INCOME, GoalType.EXPENSE]) {
        const { service, findFirst } = makeServiceWithAggregate(null);
        const result = await service.computeProgressAmount(
          { type, accountId: 'a1', userId: 'u1' },
          new Date('2026-01-01'),
          new Date('2026-01-31'),
          new Date('2026-01-15'),
        );
        expect(result.toString()).toBe('0');
        expect(findFirst).not.toHaveBeenCalled();
      }
    });

    it('INCOME sums matching items within the period via a DB aggregate', async () => {
      const { service, aggregate } = makeServiceWithAggregate(
        new Prisma.Decimal('200'),
      );
      const result = await service.computeProgressAmount(
        { type: GoalType.INCOME, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      expect(result.toString()).toBe('200');
      expect(aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1', accountId: 'a1' }),
        }),
      );
      // Same occurredAt-vs-createdAt standardization as the BALANCE case above.
      const call = aggregate.mock.calls[0][0] as {
        where: {
          createdAt?: unknown;
          transaction?: {
            occurredAt?: unknown;
            type?: unknown;
            category?: unknown;
          };
        };
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
      // Deleted transactions are not income/spending any more.
      expect(
        (call.where.transaction as { deletedAt?: unknown }).deletedAt,
      ).toBeNull();
      expect(call.where.transaction?.category).toBeUndefined();
    });

    it('EXPENSE filters by the transaction type EXPENSE, not by category', async () => {
      const { service, aggregate } = makeServiceWithAggregate(
        new Prisma.Decimal('50'),
      );
      await service.computeProgressAmount(
        { type: GoalType.EXPENSE, accountId: 'a1', userId: 'u1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      const call = aggregate.mock.calls[0][0] as {
        where: { transaction?: { type?: unknown } };
      };
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

  describe('fixed goal end date', () => {
    const END_DAY = '2026-10-24';
    const STORED_END = new Date('2026-10-24T23:59:59.999Z');

    afterEach(() => jest.useRealTimers());

    it('stores a date-only end as the last instant of that day, on the goal and its instance', async () => {
      const create = jest.fn(async (args: unknown) => args);
      const prisma = { goal: { create } };
      const accountsService = {
        assertActive: jest.fn(async () => ({ id: 'a1' })),
      };
      const service = new GoalsService(
        prisma as never,
        accountsService as never,
      );

      await service.create('u1', {
        accountId: 'a1',
        name: 'October cap',
        type: GoalType.EXPENSE,
        targetAmount: '100',
        isRecurring: false,
        periodStart: '2026-10-01',
        periodEnd: END_DAY,
      });

      const { data } = create.mock.calls[0][0] as {
        data: {
          periodStart: Date;
          periodEnd: Date;
          instances: { create: { periodStart: Date; periodEnd: Date } };
        };
      };
      expect(data.periodStart).toEqual(new Date('2026-10-01T00:00:00.000Z'));
      expect(data.periodEnd).toEqual(STORED_END);
      expect(data.instances.create.periodEnd).toEqual(STORED_END);
    });

    it('counts transactions on the end day, up to its last minute', async () => {
      const aggregate = jest.fn((_args: unknown) =>
        Promise.resolve({ _sum: { amount: new Prisma.Decimal('0') } }),
      );
      const service = new GoalsService(
        { transactionItem: { aggregate } } as never,
        {} as never,
      );

      await service.computeProgressAmount(
        { type: GoalType.EXPENSE, accountId: 'a1', userId: 'u1' },
        new Date('2026-10-01T00:00:00.000Z'),
        STORED_END,
        new Date('2026-10-26T09:00:00.000Z'),
      );

      const call = aggregate.mock.calls[0][0] as {
        where: { transaction: { occurredAt: { gte: Date; lte: Date } } };
      };
      const { gte, lte } = call.where.transaction.occurredAt;
      const counted = (iso: string) =>
        new Date(iso) >= gte && new Date(iso) <= lte;
      expect(counted('2026-10-24T00:00:00.000Z')).toBe(true);
      expect(counted('2026-10-24T12:00:00.000Z')).toBe(true);
      expect(counted('2026-10-24T23:59:00.000Z')).toBe(true);
      expect(counted('2026-10-25T00:00:00.000Z')).toBe(false);
    });

    function makeRolloverService(instance: { periodEnd: Date }) {
      // Applies the `periodEnd < now` filter the way the database would.
      const findMany = jest.fn(
        async ({ where }: { where: { periodEnd: { lt: Date } } }) =>
          instance.periodEnd < where.periodEnd.lt ? [instance] : [],
      );
      const update = jest.fn(async () => ({}));
      const aggregate = jest.fn(async () => ({
        _sum: { amount: new Prisma.Decimal('40') },
      }));
      const prisma = {
        goalInstance: { findMany, update, fields: { periodEnd: {} } },
        goal: { findMany: jest.fn(async () => []) },
        transactionItem: { aggregate },
      };
      return {
        service: new GoalsService(prisma as never, {} as never),
        update,
      };
    }

    const instance = {
      id: 'i1',
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: STORED_END,
      targetAmount: new Prisma.Decimal('100'),
      status: GoalStatus.IN_PROGRESS,
      goal: {
        type: GoalType.EXPENSE,
        accountId: 'a1',
        userId: 'u1',
        isRecurring: false,
      },
    };

    it('does not finalize during its last day', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-24T23:59:00.000Z') });
      const { service, update } = makeRolloverService(instance);

      await service.rolloverExpiredInstances();

      expect(update).not.toHaveBeenCalled();
    });

    it('finalizes once its last day is over', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-25T00:00:00.000Z') });
      const { service, update } = makeRolloverService(instance);

      await service.rolloverExpiredInstances();

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'i1' },
          data: expect.objectContaining({ status: GoalStatus.ACHIEVED }),
        }),
      );
    });

    it('reads as still running on its last day and as ended the next day', async () => {
      const goal = {
        id: 'g1',
        userId: 'u1',
        accountId: 'a1',
        type: GoalType.EXPENSE,
        isRecurring: false,
        instances: [instance],
      };
      const prisma = {
        goal: {
          findFirst: jest.fn(async () => goal),
          findFirstOrThrow: jest.fn(async () => goal),
        },
        transactionItem: {
          aggregate: jest.fn(async () => ({
            _sum: { amount: new Prisma.Decimal('40') },
          })),
        },
      };
      const service = new GoalsService(prisma as never, {} as never);

      jest.useFakeTimers({ now: new Date('2026-10-24T23:59:00.000Z') });
      expect((await service.findOne('u1', 'g1')).currentInstance?.status).toBe(
        GoalStatus.IN_PROGRESS,
      );

      jest.setSystemTime(new Date('2026-10-25T00:00:00.000Z'));
      expect((await service.findOne('u1', 'g1')).currentInstance?.status).toBe(
        GoalStatus.ACHIEVED,
      );
    });
  });

  describe('createGoalSchema', () => {
    const base = {
      accountId: 'a1',
      name: 'One day',
      type: GoalType.EXPENSE,
      targetAmount: '10',
      isRecurring: false,
    };

    it('accepts a fixed goal that starts and ends on the same date', () => {
      expect(
        createGoalSchema.safeParse({
          ...base,
          periodStart: '2026-10-24',
          periodEnd: '2026-10-24',
        }).success,
      ).toBe(true);
    });

    it('still rejects an end date before the start date', () => {
      expect(
        createGoalSchema.safeParse({
          ...base,
          periodStart: '2026-10-24',
          periodEnd: '2026-10-23',
        }).success,
      ).toBe(false);
    });
  });

  describe('list', () => {
    function makeServiceWithPrisma() {
      const paginate = jest.fn(async () => ({
        data: [],
        total: 0,
        limit: 20,
        offset: 0,
      }));
      const prisma = { paginated: { goal: { paginate } } };
      return {
        service: new GoalsService(prisma as never, {} as never),
        paginate,
      };
    }

    it('defaults to active goals only (archivedAt: null)', async () => {
      const { service, paginate } = makeServiceWithPrisma();
      await service.list('u1', { status: 'active', limit: 20, offset: 0 });
      expect(paginate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', archivedAt: null } }),
      );
    });

    it('filters to archived goals only when status=archived', async () => {
      const { service, paginate } = makeServiceWithPrisma();
      await service.list('u1', { status: 'archived', limit: 20, offset: 0 });
      expect(paginate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', archivedAt: { not: null } },
        }),
      );
    });

    it('applies no archived filter when status=all', async () => {
      const { service, paginate } = makeServiceWithPrisma();
      await service.list('u1', { status: 'all', limit: 20, offset: 0 });
      expect(paginate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
    });
  });

  describe('assertOwned', () => {
    it('finds an archived goal — stopping a goal must not hide its history', async () => {
      const goal = { id: 'g1', userId: 'u1', archivedAt: new Date() };
      const prisma = { goal: { findFirst: jest.fn(async () => goal) } };
      const service = new GoalsService(prisma as never, {} as never);

      const result = await service.assertOwned('u1', 'g1');

      expect(result).toBe(goal);
      expect(prisma.goal.findFirst).toHaveBeenCalledWith({
        where: { id: 'g1', userId: 'u1' },
      });
    });
  });

  describe('restore', () => {
    it('clears archivedAt on an archived goal owned by the user', async () => {
      const prisma = {
        goal: {
          findFirst: jest.fn(async () => ({
            id: 'g1',
            userId: 'u1',
            archivedAt: new Date(),
            isRecurring: false,
            periodEnd: new Date(0),
          })),
          update: jest.fn(async () => ({ id: 'g1', archivedAt: null })),
        },
        goalInstance: {
          findMany: jest.fn(async () => []),
          fields: { periodEnd: {} },
        },
        $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
      };
      const service = new GoalsService(prisma as never, {} as never);

      await service.restore('u1', 'g1');

      expect(prisma.goal.findFirst).toHaveBeenCalledWith({
        where: { id: 'g1', userId: 'u1', archivedAt: { not: null } },
      });
      expect(prisma.goal.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { archivedAt: null },
      });
    });

    it('404s for a goal that is not archived or not owned', async () => {
      const prisma = {
        goal: { findFirst: jest.fn(async () => null), update: jest.fn() },
      };
      const service = new GoalsService(prisma as never, {} as never);

      await expect(service.restore('u1', 'g1')).rejects.toThrow('not found');
      expect(prisma.goal.update).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    it('returns the paginated shape and checks ownership first', async () => {
      const page = { data: [{ id: 'gi1' }], total: 15, limit: 1, offset: 0 };
      const paginate = jest.fn(async () => page);
      const goal = { id: 'g1', userId: 'u1' };
      const prisma = {
        goal: { findFirst: jest.fn(async () => goal) },
        paginated: { goalInstance: { paginate } },
      };
      const service = new GoalsService(prisma as never, {} as never);

      const result = await service.history('u1', 'g1', { limit: 1, offset: 0 });

      expect(prisma.goal.findFirst).toHaveBeenCalledWith({
        where: { id: 'g1', userId: 'u1' },
      });
      expect(result).toEqual({
        ...page,
        data: [{ id: 'gi1', progressSource: 'PERIOD_END' }],
      });
      expect(result.total).toBe(15);
      expect(paginate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { goalId: 'g1' },
          limit: 1,
          offset: 0,
        }),
      );
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
      const [start, end] = resolvePeriodBounds(
        anchor,
        GoalRecurrenceUnit.MONTH,
      );
      expect(start).toEqual(new Date(Date.UTC(2026, 0, 1)));
      expect(end).toEqual(new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999)));
    });

    it('MONTH: December rolls the period end into January of the next year, not local-time February', () => {
      const anchor = new Date(Date.UTC(2026, 11, 15));
      const [start, end] = resolvePeriodBounds(
        anchor,
        GoalRecurrenceUnit.MONTH,
      );
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
