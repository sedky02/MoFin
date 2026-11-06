import { GoalStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_CATEGORIES } from '../modules/categories/default-categories';
import { buildDemoPlan, DEMO_DISPLAY_NAME, DEMO_EMAIL } from './demo-plan';
import { DemoSeeder, SEED_TRANSACTION_OPTIONS } from './demo-seeder';

const NOW = new Date('2026-10-25T15:30:00.000Z');

function makeSeeder(existing: { id: string } | null) {
  const plan = buildDemoPlan(NOW);
  const categoryRows = [...DEFAULT_CATEGORIES, ...plan.extraCategories].map(
    (c) => ({ id: `cat-${c.name}`, name: c.name }),
  );
  let created = 0;
  const instances: {
    id: string;
    goalId: string;
    periodStart: Date;
    periodEnd: Date;
    status: GoalStatus;
  }[] = [];

  // The transaction client the seed runs on; nothing goes through `prisma` itself.
  const db = {
    transaction: { update: jest.fn() },
    category: { findMany: jest.fn(async () => categoryRows) },
    goal: {
      findUniqueOrThrow: jest.fn(
        async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          isRecurring: true,
          recurrenceUnit: 'MONTH',
          type: 'INCOME',
          targetAmount: new Prisma.Decimal(500),
          instances: instances
            .filter((i) => i.goalId === where.id)
            .sort((a, b) => +b.periodStart - +a.periodStart)
            .slice(0, 1),
        }),
      ),
    },
    goalInstance: {
      update: jest.fn(),
      create: jest.fn(
        async ({ data }: { data: (typeof instances)[number] }) => {
          instances.push({
            ...data,
            id: `gi-${instances.length}`,
            status: GoalStatus.IN_PROGRESS,
          });
        },
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (run: (client: typeof db) => unknown) =>
      run(db),
    ),
  };
  const usersService = {
    findByEmail: jest.fn(async () => existing),
    deleteUserData: jest.fn(async () => undefined),
    createUser: jest.fn(async () => ({ id: 'demo' })),
  };
  const accountsService = {
    create: jest.fn(async (_u: string, dto: { name: string }) => ({
      id: `acc-${dto.name}`,
    })),
  };
  const categoriesService = { create: jest.fn() };
  const transactionsService = {
    create: jest.fn(async (_u: string, command: { occurredAt: Date }) => ({
      id: `tx-${++created}`,
      occurredAt: command.occurredAt,
      recurringEndDate: null,
    })),
  };
  const goalsService = {
    create: jest.fn(
      async (
        _u: string,
        dto: { name: string; isRecurring: boolean; periodStart: string },
      ) => {
        const id = `goal-${dto.name}`;
        const start = new Date(dto.periodStart);
        const end = new Date(
          Date.UTC(
            start.getUTCFullYear(),
            start.getUTCMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          ),
        );
        instances.push({
          id: `gi-${instances.length}`,
          goalId: id,
          periodStart: start,
          periodEnd: end,
          status: GoalStatus.IN_PROGRESS,
        });
        return { id, isRecurring: dto.isRecurring };
      },
    ),
    computeProgressAmount: jest.fn(async () => new Prisma.Decimal(600)),
    evaluateStatus: jest.fn(() => GoalStatus.ACHIEVED),
  };

  const seeder = new DemoSeeder(
    prisma as never,
    usersService as never,
    accountsService as never,
    categoriesService as never,
    transactionsService as never,
    goalsService as never,
  );
  return {
    seeder,
    plan,
    prisma,
    db,
    usersService,
    accountsService,
    categoriesService,
    transactionsService,
    goalsService,
    instances,
  };
}

describe('DemoSeeder', () => {
  it('does nothing when the demo account already exists', async () => {
    const { seeder, plan, usersService, transactionsService } = makeSeeder({
      id: 'old',
    });

    expect(await seeder.run({ plan, password: 'pw', reset: false })).toEqual({
      status: 'exists',
      userId: 'old',
    });
    expect(usersService.deleteUserData).not.toHaveBeenCalled();
    expect(usersService.createUser).not.toHaveBeenCalled();
    expect(transactionsService.create).not.toHaveBeenCalled();
  });

  it('deletes and recreates it on reset', async () => {
    const { seeder, plan, usersService } = makeSeeder({ id: 'old' });

    const result = await seeder.run({ plan, password: 'pw', reset: true });

    expect(usersService.deleteUserData).toHaveBeenCalledWith('old');
    expect(usersService.createUser).toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'created', reset: true });
  });

  it('creates the user the way registration does, with a bcrypt cost-12 hash', async () => {
    const { seeder, plan, usersService } = makeSeeder(null);

    await seeder.run({ plan, password: 'Secret123!', reset: false });

    const input = (
      usersService.createUser.mock.calls[0] as unknown as [
        { email: string; displayName: string; passwordHash: string },
      ]
    )[0];
    expect(input).toMatchObject({
      email: DEMO_EMAIL,
      displayName: DEMO_DISPLAY_NAME,
    });
    expect(bcrypt.getRounds(input.passwordHash)).toBe(12);
    expect(await bcrypt.compare('Secret123!', input.passwordHash)).toBe(true);
  });

  it('writes every planned transaction through TransactionsService with the created ids', async () => {
    const {
      seeder,
      plan,
      db,
      accountsService,
      categoriesService,
      transactionsService,
    } = makeSeeder(null);

    const result = await seeder.run({ plan, password: 'pw', reset: false });

    expect(accountsService.create).toHaveBeenCalledTimes(4);
    expect(accountsService.create).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({
        name: 'Credit card',
        openingBalance: '-420.00',
      }),
      db,
    );
    expect(categoriesService.create).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({ name: 'Household' }),
      db,
    );
    for (const call of transactionsService.create.mock.calls as unknown[][])
      expect(call[2]).toBe(db);
    const series = plan.recurring[0];
    expect(transactionsService.create).toHaveBeenCalledTimes(
      plan.transactions.length + 1 + series.occurrences.length,
    );
    expect(result).toMatchObject({
      status: 'created',
      transactions: plan.transactions.length + 1 + series.occurrences.length,
    });

    const split = transactionsService.create.mock.calls.find(
      ([, command]) =>
        ((command as { items?: unknown[] }).items?.length ?? 0) > 1,
    );
    expect(split?.[1]).toMatchObject({
      fromAccountId: 'acc-Credit card',
      items: [{ categoryId: 'cat-Groceries' }, { categoryId: 'cat-Household' }],
    });
  });

  it('posts the rent occurrences like the recurring job: linked to the root, cursor moved in the same transaction', async () => {
    const { seeder, plan, db, transactionsService } = makeSeeder(null);

    await seeder.run({ plan, password: 'pw', reset: false });

    const calls = transactionsService.create.mock.calls as unknown as [
      string,
      Record<string, unknown>,
      unknown?,
    ][];
    const rootCall = calls.find(([, command]) => command.isRecurring);
    expect(rootCall?.[1]).toMatchObject({
      isRecurring: true,
      recurringInterval: 'MONTHLY',
      categoryId: 'cat-Rent',
    });
    const rootId = `tx-${calls.indexOf(rootCall!) + 1}`;

    const occurrences = calls.filter(
      ([, command]) => command.parentTransactionId,
    );
    expect(occurrences.map(([, command]) => command.occurredAt)).toEqual(
      plan.recurring[0].occurrences,
    );
    for (const [, command, client] of occurrences) {
      expect(command.parentTransactionId).toBe(rootId);
      expect(command.isRecurring).toBeUndefined();
      expect(client).toBe(db);
    }
    expect(db.transaction.update).toHaveBeenLastCalledWith({
      where: { id: rootId },
      data: { nextOccurrenceAt: new Date('2026-11-01T08:00:00.000Z') },
    });
  });

  it('creates the goals and closes the past periods of the recurring ones', async () => {
    const { seeder, plan, db, goalsService, instances } = makeSeeder(null);

    await seeder.run({ plan, password: 'pw', reset: false });

    expect(goalsService.create).toHaveBeenCalledTimes(3);
    expect(goalsService.create).toHaveBeenCalledWith(
      'demo',
      expect.objectContaining({
        name: 'Groceries budget',
        accountId: 'acc-Credit card',
      }),
      db,
    );
    // August and September close for each of the two monthly goals; October stays open.
    expect(db.goalInstance.update).toHaveBeenCalledTimes(4);
    const side = instances
      .filter((i) => i.goalId === 'goal-Side income')
      .map((i) => i.periodStart.toISOString().slice(0, 10));
    expect(side).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
  });

  it('creates the user and its data in one transaction, so a failure rolls both back', async () => {
    const { seeder, plan, prisma, db, usersService, transactionsService } =
      makeSeeder(null);
    transactionsService.create.mockRejectedValueOnce(new Error('boom'));

    await expect(
      seeder.run({ plan, password: 'pw', reset: false }),
    ).rejects.toThrow('boom');
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      SEED_TRANSACTION_OPTIONS,
    );
    expect(usersService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: DEMO_EMAIL }),
      db,
    );
    // Nothing to clean up by hand: the transaction never committed.
    expect(usersService.deleteUserData).not.toHaveBeenCalled();
  });
});
