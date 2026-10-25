import {
  Goal,
  GoalInstance,
  GoalRecurrenceUnit,
  GoalStatus,
  GoalType,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { GoalsService } from './goals.service';

// B-26: a goal is judged when its period ends. These tests run the service
// against a small in-memory stand-in for Prisma so the rules can be checked
// end to end: live progress for the open period, sticky ACHIEVED, frozen ended
// goals, and finished periods that never get recomputed.

type Row = Record<string, unknown>;
type FakeTransaction = {
  id: string;
  occurredAt: Date;
  type: TransactionType;
  deletedAt: Date | null;
  amount: Prisma.Decimal;
};

const FIELD = Symbol('field');
const fieldRef = (name: string) => ({ [FIELD]: name });
const isFieldRef = (v: unknown): v is { [FIELD]: string } =>
  typeof v === 'object' && v !== null && FIELD in v;

function compare(a: unknown, b: unknown): number {
  if (a instanceof Prisma.Decimal) return a.cmp(b as Prisma.Decimal);
  if (a instanceof Date) return a.getTime() - (b as Date).getTime();
  return a === b ? 0 : (a as number) < (b as number) ? -1 : 1;
}

/** Just enough of Prisma's `where` semantics for GoalsService's queries. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    const value = row[key];
    if (
      cond === null ||
      typeof cond !== 'object' ||
      cond instanceof Date ||
      cond instanceof Prisma.Decimal
    ) {
      return cond === null ? value == null : compare(value, cond) === 0;
    }
    const ops = cond as Row;
    const resolve = (v: unknown) => (isFieldRef(v) ? row[v[FIELD]] : v);
    if (['lt', 'lte', 'gt', 'gte', 'not', 'in'].some((op) => op in ops)) {
      if ('lt' in ops && !(compare(value, resolve(ops.lt)) < 0)) return false;
      if ('lte' in ops && !(compare(value, resolve(ops.lte)) <= 0))
        return false;
      if ('gt' in ops && !(compare(value, resolve(ops.gt)) > 0)) return false;
      if ('gte' in ops && !(compare(value, resolve(ops.gte)) >= 0))
        return false;
      if (
        'not' in ops &&
        (ops.not === null ? value == null : compare(value, ops.not) === 0)
      )
        return false;
      if ('in' in ops && !(ops.in as unknown[]).includes(value)) return false;
      return true;
    }
    return matches(value as Row, ops);
  });
}

function makeFakeDb() {
  const goals: Goal[] = [];
  const instances: GoalInstance[] = [];
  const transactions: FakeTransaction[] = [];
  let seq = 0;

  const withGoal = (i: GoalInstance) => ({
    ...i,
    goal: goals.find((g) => g.id === i.goalId)!,
  });
  const byStartDesc = (a: GoalInstance, b: GoalInstance) =>
    b.periodStart.getTime() - a.periodStart.getTime();
  const withLatestInstance = (g: Goal) => ({
    ...g,
    instances: instances
      .filter((i) => i.goalId === g.id)
      .sort(byStartDesc)
      .slice(0, 1)
      .map((i) => ({ ...i })),
  });
  const assign = <T extends object>(target: T, data: Row) =>
    Object.assign(
      target,
      Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      ),
    );

  const goalInstance = {
    fields: { periodEnd: fieldRef('periodEnd') },
    findMany: async ({
      where,
      include,
      orderBy,
    }: {
      where: Row;
      include?: Row;
      orderBy?: Row;
    }) => {
      const rows = instances
        .filter((i) => matches(withGoal(i), where))
        .map((i) => (include?.goal ? withGoal(i) : { ...i }));
      if (orderBy?.periodStart === 'asc')
        rows.sort((a, b) => -byStartDesc(a, b));
      if (orderBy?.periodStart === 'desc') rows.sort(byStartDesc);
      return rows;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => ({
      ...assign(instances.find((i) => i.id === where.id)!, data),
    }),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = instances.filter((i) => matches(i as unknown as Row, where));
      rows.forEach((i) => assign(i, data));
      return { count: rows.length };
    },
    create: async ({ data }: { data: Row }) => {
      const row = {
        id: `gi${++seq}`,
        progressAmount: new Prisma.Decimal(0),
        status: GoalStatus.IN_PROGRESS,
        computedAt: new Date(),
        ...data,
      } as GoalInstance;
      if (
        instances.some(
          (i) =>
            i.goalId === row.goalId &&
            i.periodStart.getTime() === row.periodStart.getTime(),
        )
      ) {
        throw new Error('Unique constraint failed on (goalId, periodStart)');
      }
      instances.push(row);
      return { ...row };
    },
    upsert: async ({
      where,
      create,
    }: {
      where: { goalId_periodStart: { goalId: string; periodStart: Date } };
      create: Row;
    }) => {
      const { goalId, periodStart } = where.goalId_periodStart;
      const existing = instances.find(
        (i) =>
          i.goalId === goalId &&
          i.periodStart.getTime() === periodStart.getTime(),
      );
      return existing ? { ...existing } : goalInstance.create({ data: create });
    },
  };

  const goal = {
    findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
      const found = goals.find((g) => matches(g as unknown as Row, where));
      if (!found) return null;
      return include?.instances ? withLatestInstance(found) : { ...found };
    },
    findFirstOrThrow: async (args: { where: Row; include?: Row }) => {
      const found = await goal.findFirst(args);
      if (!found) throw new Error('not found');
      return found;
    },
    findMany: async ({ where }: { where: Row }) =>
      goals
        .filter((g) => matches(g as unknown as Row, where))
        .map(withLatestInstance),
    update: async ({ where, data }: { where: { id: string }; data: Row }) => ({
      ...assign(goals.find((g) => g.id === where.id)!, data),
    }),
  };

  type ItemWhere = {
    transaction: {
      occurredAt: { gte?: Date; lte: Date };
      type?: TransactionType;
      deletedAt: null;
    };
  };
  const itemsMatching = (where: ItemWhere) =>
    transactions.filter((t) =>
      matches(t as unknown as Row, where.transaction as unknown as Row),
    );

  const prisma = {
    goal,
    goalInstance,
    // Balance goals start from the account's opening balance (B-10); these fake
    // accounts have none.
    account: {
      findFirst: async () => ({ openingBalance: new Prisma.Decimal(0) }),
    },
    transactionItem: {
      // Every fake transaction has one item on the goal's account: income
      // credits it, expense debits it.
      aggregate: async ({ where }: { where: ItemWhere }) => {
        const rows = itemsMatching(where);
        return {
          _sum: {
            amount: rows.length
              ? rows.reduce((s, t) => s.plus(t.amount), new Prisma.Decimal(0))
              : null,
          },
        };
      },
      groupBy: async ({ where }: { where: ItemWhere }) => {
        const rows = itemsMatching(where);
        const sum = (type: TransactionType) =>
          rows
            .filter((t) => t.type === type)
            .reduce((s, t) => s.plus(t.amount), new Prisma.Decimal(0));
        return [
          {
            direction: 'CREDIT',
            _sum: { amount: sum(TransactionType.INCOME) },
          },
          {
            direction: 'DEBIT',
            _sum: { amount: sum(TransactionType.EXPENSE) },
          },
        ];
      },
    },
    paginated: {
      goalInstance: {
        paginate: async ({
          where,
          limit,
          offset,
        }: {
          where: Row;
          limit: number;
          offset: number;
        }) => {
          const all = instances
            .filter((i) => matches(i as unknown as Row, where))
            .sort(byStartDesc);
          return {
            data: all.slice(offset, offset + limit).map((i) => ({ ...i })),
            total: all.length,
            limit,
            offset,
          };
        },
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
  };

  function addGoal(
    data: Partial<Goal> & Pick<Goal, 'type' | 'periodStart'>,
    firstPeriodEnd: Date,
  ) {
    const row: Goal = {
      id: `g${++seq}`,
      userId: 'u1',
      accountId: 'a1',
      name: 'Goal',
      targetAmount: new Prisma.Decimal(100),
      isRecurring: false,
      recurrenceUnit: null,
      periodEnd: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    goals.push(row);
    instances.push({
      id: `gi${++seq}`,
      goalId: row.id,
      periodStart: row.periodStart,
      periodEnd: firstPeriodEnd,
      targetAmount: row.targetAmount,
      progressAmount: new Prisma.Decimal(0),
      status: GoalStatus.IN_PROGRESS,
      computedAt: new Date(),
    });
    return row;
  }

  function addTransaction(
    type: TransactionType,
    amount: string,
    occurredAt: string,
  ) {
    const row: FakeTransaction = {
      id: `t${++seq}`,
      type,
      amount: new Prisma.Decimal(amount),
      occurredAt: new Date(occurredAt),
      deletedAt: null,
    };
    transactions.push(row);
    return row;
  }

  const service = new GoalsService(prisma as never, {} as never);
  const instancesOf = (goalId: string) =>
    instances.filter((i) => i.goalId === goalId).sort(byStartDesc);
  return { service, addGoal, addTransaction, instancesOf };
}

const at = (iso: string) => jest.setSystemTime(new Date(iso));
const OCT_START = new Date('2026-10-01T00:00:00.000Z');
const OCT_END = new Date('2026-10-31T23:59:59.999Z');

function monthlyGoal(
  db: ReturnType<typeof makeFakeDb>,
  type: GoalType,
  target = '100',
) {
  return db.addGoal(
    {
      type,
      isRecurring: true,
      recurrenceUnit: GoalRecurrenceUnit.MONTH,
      periodStart: OCT_START,
      targetAmount: new Prisma.Decimal(target),
    },
    OCT_END,
  );
}

describe('goal rules (B-26)', () => {
  beforeEach(() =>
    jest.useFakeTimers({ now: new Date('2026-10-05T12:00:00.000Z') }),
  );
  afterEach(() => jest.useRealTimers());

  describe('history', () => {
    it('shows the open period with the same live progress as the card', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.INCOME, '500');
      db.addTransaction(
        TransactionType.INCOME,
        '120',
        '2026-10-02T09:00:00.000Z',
      );
      db.addTransaction(
        TransactionType.INCOME,
        '30.5',
        '2026-10-04T09:00:00.000Z',
      );

      const card = (await db.service.findOne('u1', goal.id)).currentInstance!;
      const { data } = await db.service.history('u1', goal.id, {
        limit: 20,
        offset: 0,
      });

      expect(card.progressAmount.toString()).toBe('150.5');
      expect(data[0].progressAmount.toString()).toBe(
        card.progressAmount.toString(),
      );
      expect(data[0].status).toBe(card.status);
      expect(data[0].progressSource).toBe('LIVE');
    });

    it('labels finished periods as recorded at period end and keeps their result', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.INCOME, '500');
      db.addTransaction(
        TransactionType.INCOME,
        '200',
        '2026-10-10T09:00:00.000Z',
      );

      at('2026-11-01T00:00:00.000Z');
      await db.service.rolloverExpiredInstances();
      db.addTransaction(
        TransactionType.INCOME,
        '50',
        '2026-11-03T09:00:00.000Z',
      );
      at('2026-11-05T12:00:00.000Z');

      const { data } = await db.service.history('u1', goal.id, {
        limit: 20,
        offset: 0,
      });
      expect(
        data.map((r) => [
          r.progressSource,
          r.status,
          r.progressAmount.toString(),
        ]),
      ).toEqual([
        ['LIVE', GoalStatus.IN_PROGRESS, '50'],
        ['PERIOD_END', GoalStatus.FAILED, '200'],
      ]);
    });
  });

  describe('a finished period is never recomputed', () => {
    it('editing or deleting a transaction in a finished period leaves its recorded result alone', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.EXPENSE, '100');
      const lunch = db.addTransaction(
        TransactionType.EXPENSE,
        '80',
        '2026-10-10T12:00:00.000Z',
      );

      at('2026-11-01T00:00:00.000Z');
      await db.service.rolloverExpiredInstances();
      const [, october] = db.instancesOf(goal.id);
      expect([october.status, october.progressAmount.toString()]).toEqual([
        GoalStatus.ACHIEVED,
        '80',
      ]);

      // Back-edit October: now it would have been over the cap.
      lunch.amount = new Prisma.Decimal('180');
      at('2026-11-02T00:00:00.000Z');
      await db.service.rolloverExpiredInstances();
      const { data } = await db.service.history('u1', goal.id, {
        limit: 20,
        offset: 0,
      });
      expect([data[1].status, data[1].progressAmount.toString()]).toEqual([
        GoalStatus.ACHIEVED,
        '80',
      ]);

      lunch.deletedAt = new Date();
      const again = await db.service.history('u1', goal.id, {
        limit: 20,
        offset: 0,
      });
      expect(again.data[1].progressAmount.toString()).toBe('80');
    });
  });

  describe('achieved sticks for the rest of the period', () => {
    it('a balance goal stays ACHIEVED after the balance dips, and is finalized as ACHIEVED', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.BALANCE, '1000');
      db.addTransaction(
        TransactionType.INCOME,
        '1200',
        '2026-10-03T09:00:00.000Z',
      );

      expect(
        (await db.service.findOne('u1', goal.id)).currentInstance!.status,
      ).toBe(GoalStatus.ACHIEVED);
      expect(db.instancesOf(goal.id)[0].status).toBe(GoalStatus.ACHIEVED);

      db.addTransaction(
        TransactionType.EXPENSE,
        '500',
        '2026-10-06T09:00:00.000Z',
      );
      at('2026-10-07T12:00:00.000Z');
      const card = (await db.service.findOne('u1', goal.id)).currentInstance!;
      expect(card.status).toBe(GoalStatus.ACHIEVED);
      expect(card.progressAmount.toString()).toBe('700'); // progress itself stays live

      at('2026-11-01T00:00:00.000Z');
      await db.service.rolloverExpiredInstances();
      const october = db.instancesOf(goal.id)[1];
      expect(october.status).toBe(GoalStatus.ACHIEVED);
      expect(october.progressAmount.toString()).toBe('700');
      expect(october.computedAt > october.periodEnd).toBe(true);
    });

    it('an income goal stays ACHIEVED when the income that reached it is deleted', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.INCOME, '100');
      const pay = db.addTransaction(
        TransactionType.INCOME,
        '150',
        '2026-10-03T09:00:00.000Z',
      );
      await db.service.findOne('u1', goal.id);

      pay.deletedAt = new Date();
      const card = (await db.service.findOne('u1', goal.id)).currentInstance!;
      expect([card.status, card.progressAmount.toString()]).toEqual([
        GoalStatus.ACHIEVED,
        '0',
      ]);
    });

    it('an expense cap stays live: deleting the expense that broke it brings it back under', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.EXPENSE, '100');
      const big = db.addTransaction(
        TransactionType.EXPENSE,
        '150',
        '2026-10-03T09:00:00.000Z',
      );

      expect(
        (await db.service.findOne('u1', goal.id)).currentInstance!.status,
      ).toBe(GoalStatus.FAILED);
      expect(db.instancesOf(goal.id)[0].status).toBe(GoalStatus.IN_PROGRESS);

      big.deletedAt = new Date();
      expect(
        (await db.service.findOne('u1', goal.id)).currentInstance!.status,
      ).toBe(GoalStatus.IN_PROGRESS);
    });

    it('raising the target re-opens an achieved period; lowering it does not', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.INCOME, '100');
      db.addTransaction(
        TransactionType.INCOME,
        '150',
        '2026-10-03T09:00:00.000Z',
      );
      await db.service.findOne('u1', goal.id);

      await db.service.update('u1', goal.id, { targetAmount: '90' });
      expect(db.instancesOf(goal.id)[0].status).toBe(GoalStatus.ACHIEVED);

      await db.service.update('u1', goal.id, { targetAmount: '200' });
      const card = (await db.service.findOne('u1', goal.id)).currentInstance!;
      expect([card.status, card.targetAmount.toString()]).toEqual([
        GoalStatus.IN_PROGRESS,
        '200',
      ]);
    });
  });

  describe('ending and restoring', () => {
    it("an ended goal's progress and periods don't change after more transactions or rollovers", async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.INCOME, '500');
      db.addTransaction(
        TransactionType.INCOME,
        '120',
        '2026-10-02T09:00:00.000Z',
      );

      at('2026-10-10T12:00:00.000Z');
      await db.service.archive('u1', goal.id);
      const frozen = { ...db.instancesOf(goal.id)[0] };
      expect(frozen.progressAmount.toString()).toBe('120');

      db.addTransaction(
        TransactionType.INCOME,
        '400',
        '2026-10-12T09:00:00.000Z',
      );
      at('2026-11-01T00:00:00.000Z');
      await db.service.rolloverExpiredInstances();
      at('2026-12-01T00:00:00.000Z');
      await db.service.rolloverExpiredInstances();

      expect(db.instancesOf(goal.id)).toEqual([frozen]);
      const card = (await db.service.findOne('u1', goal.id)).currentInstance!;
      expect([card.status, card.progressAmount.toString()]).toEqual([
        GoalStatus.IN_PROGRESS,
        '120',
      ]);
      const { data } = await db.service.history('u1', goal.id, {
        limit: 20,
        offset: 0,
      });
      expect(
        data.map((r) => [r.progressSource, r.progressAmount.toString()]),
      ).toEqual([['ENDED', '120']]);
    });

    it('restoring starts a fresh period from today and closes the frozen one on the day it was ended', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.INCOME, '500');
      db.addTransaction(
        TransactionType.INCOME,
        '120',
        '2026-10-02T09:00:00.000Z',
      );
      at('2026-10-10T12:00:00.000Z');
      await db.service.archive('u1', goal.id);

      // Income while it was ended is never backfilled.
      db.addTransaction(
        TransactionType.INCOME,
        '900',
        '2026-11-20T09:00:00.000Z',
      );
      db.addTransaction(
        TransactionType.INCOME,
        '40',
        '2026-12-15T08:00:00.000Z',
      );
      at('2026-12-15T15:30:00.000Z');
      await db.service.restore('u1', goal.id);

      const [fresh, october] = db.instancesOf(goal.id);
      expect(db.instancesOf(goal.id)).toHaveLength(2);
      expect(fresh.periodStart).toEqual(new Date('2026-12-15T00:00:00.000Z'));
      expect(fresh.periodEnd).toEqual(new Date('2026-12-31T23:59:59.999Z'));
      expect(october.periodEnd).toEqual(new Date('2026-10-10T12:00:00.000Z'));
      expect([october.status, october.progressAmount.toString()]).toEqual([
        GoalStatus.FAILED,
        '120',
      ]);

      const card = (await db.service.findOne('u1', goal.id)).currentInstance!;
      expect(card.id).toBe(fresh.id);
      expect(card.progressAmount.toString()).toBe('40');

      // The closed period is final: the rollover leaves it alone and continues from the fresh one.
      at('2027-01-01T00:00:00.000Z');
      await db.service.rolloverExpiredInstances();
      expect(
        db.instancesOf(goal.id).map((i) => i.periodStart.toISOString()),
      ).toEqual([
        '2027-01-01T00:00:00.000Z',
        '2026-12-15T00:00:00.000Z',
        '2026-10-01T00:00:00.000Z',
      ]);
      expect(db.instancesOf(goal.id)[2].periodEnd).toEqual(
        new Date('2026-10-10T12:00:00.000Z'),
      );
    });

    it('a goal achieved before it was ended keeps ACHIEVED for the closed period', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.BALANCE, '100');
      db.addTransaction(
        TransactionType.INCOME,
        '150',
        '2026-10-02T09:00:00.000Z',
      );
      await db.service.findOne('u1', goal.id);
      db.addTransaction(
        TransactionType.EXPENSE,
        '100',
        '2026-10-04T09:00:00.000Z',
      );

      at('2026-10-10T12:00:00.000Z');
      await db.service.archive('u1', goal.id);
      at('2026-10-20T12:00:00.000Z');
      await db.service.restore('u1', goal.id);

      const [fresh, closed] = db.instancesOf(goal.id);
      expect([closed.status, closed.progressAmount.toString()]).toEqual([
        GoalStatus.ACHIEVED,
        '50',
      ]);
      expect(fresh.periodStart).toEqual(new Date('2026-10-20T00:00:00.000Z'));
      expect(fresh.status).toBe(GoalStatus.IN_PROGRESS);
    });

    it('ending and restoring on the same day keeps the period that started that day', async () => {
      const db = makeFakeDb();
      const start = new Date('2026-10-05T00:00:00.000Z');
      const goal = db.addGoal(
        { type: GoalType.EXPENSE, periodStart: start, periodEnd: OCT_END },
        OCT_END,
      );

      at('2026-10-05T10:00:00.000Z');
      await db.service.archive('u1', goal.id);
      at('2026-10-05T16:00:00.000Z');
      await db.service.restore('u1', goal.id);

      expect(db.instancesOf(goal.id)).toHaveLength(1);
      expect(db.instancesOf(goal.id)[0].periodStart).toEqual(start);
    });

    it('a fixed goal whose end date passed while it was ended gets no new period', async () => {
      const db = makeFakeDb();
      const goal = db.addGoal(
        { type: GoalType.EXPENSE, periodStart: OCT_START, periodEnd: OCT_END },
        OCT_END,
      );
      db.addTransaction(
        TransactionType.EXPENSE,
        '20',
        '2026-10-02T09:00:00.000Z',
      );

      at('2026-10-10T12:00:00.000Z');
      await db.service.archive('u1', goal.id);
      at('2026-11-15T12:00:00.000Z');
      await db.service.restore('u1', goal.id);

      const all = db.instancesOf(goal.id);
      expect(all).toHaveLength(1);
      expect([all[0].status, all[0].progressAmount.toString()]).toEqual([
        GoalStatus.ACHIEVED,
        '20',
      ]);
    });

    it('a fixed goal restored before its end date tracks from today to that date', async () => {
      const db = makeFakeDb();
      const goal = db.addGoal(
        { type: GoalType.EXPENSE, periodStart: OCT_START, periodEnd: OCT_END },
        OCT_END,
      );

      at('2026-10-10T12:00:00.000Z');
      await db.service.archive('u1', goal.id);
      at('2026-10-20T12:00:00.000Z');
      await db.service.restore('u1', goal.id);

      const [fresh] = db.instancesOf(goal.id);
      expect([fresh.periodStart, fresh.periodEnd]).toEqual([
        new Date('2026-10-20T00:00:00.000Z'),
        OCT_END,
      ]);
    });

    it('ending an expense goal that is over its cap leaves the period unjudged', async () => {
      const db = makeFakeDb();
      const goal = monthlyGoal(db, GoalType.EXPENSE, '100');
      db.addTransaction(
        TransactionType.EXPENSE,
        '150',
        '2026-10-02T09:00:00.000Z',
      );

      await db.service.archive('u1', goal.id);

      const [frozen] = db.instancesOf(goal.id);
      expect([frozen.status, frozen.progressAmount.toString()]).toEqual([
        GoalStatus.IN_PROGRESS,
        '150',
      ]);
    });
  });
});
