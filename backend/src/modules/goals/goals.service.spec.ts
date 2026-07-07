import { GoalStatus, GoalType, Prisma } from '@prisma/client';
import { GoalsService } from './goals.service';

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
    function makeServiceWithItems(items: unknown[]) {
      const prisma = { transactionItem: { findMany: jest.fn(async () => items) } };
      return new GoalsService(prisma as never, {} as never);
    }

    it('BALANCE sums all items up to the boundary regardless of periodStart', async () => {
      const items = [
        { direction: 'CREDIT', amount: new Prisma.Decimal('100') },
        { direction: 'DEBIT', amount: new Prisma.Decimal('30') },
      ];
      const service = makeServiceWithItems(items);
      const result = await service.computeProgressAmount(
        { type: GoalType.BALANCE, accountId: 'a1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      expect(result.toString()).toBe('70');
    });

    it('INCOME sums matching items within the period', async () => {
      const items = [{ amount: new Prisma.Decimal('200') }];
      const service = makeServiceWithItems(items);
      const result = await service.computeProgressAmount(
        { type: GoalType.INCOME, accountId: 'a1' },
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        new Date('2026-01-15'),
      );
      expect(result.toString()).toBe('200');
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
});
