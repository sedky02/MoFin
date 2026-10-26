import { NotFoundException } from '@nestjs/common';
import {
  LedgerDirection,
  Prisma,
  RecurringInterval,
  TransactionType,
} from '@prisma/client';
import { CategoriesService } from '../modules/categories/categories.service';
import { DEFAULT_CATEGORIES } from '../modules/categories/default-categories';
import { LedgerService } from '../modules/ledger/ledger.service';
import {
  computeNextOccurrence,
  TransactionsService,
} from '../modules/transactions/transactions.service';
import {
  allPostings,
  buildDemoPlan,
  createRandom,
  DemoIds,
  DemoPlan,
  DemoTransactionPlan,
  demoSeedRefusal,
  summarizePlan,
  toCreateCommand,
} from './demo-plan';

const NOW = new Date('2026-10-25T15:30:00.000Z');
const WINDOW_START = new Date('2026-08-01T00:00:00.000Z');
const AMOUNT = /^\d+\.\d{2}$/;

const cents = (amount: string | Prisma.Decimal) =>
  Math.round(Number(amount.toString()) * 100);

interface WrittenItem {
  accountId: string;
  categoryId?: string;
  direction: LedgerDirection;
  amount: Prisma.Decimal;
  currency: string;
}

/**
 * The real TransactionsService (validation, category checks, ledger lines)
 * over an in-memory store, so the test sees the items the create path would
 * write for each planned transaction.
 */
function makeWriter(plan: DemoPlan) {
  const accounts = plan.accounts.map((account) => ({
    ...account,
    id: `acc-${account.key}`,
    userId: 'demo',
    archivedAt: null,
  }));
  const categories = [...DEFAULT_CATEGORIES, ...plan.extraCategories].map(
    (category) => ({
      ...category,
      id: `cat-${category.name}`,
      userId: 'demo',
      archivedAt: null,
    }),
  );
  const ids: DemoIds = {
    accounts: Object.fromEntries(
      accounts.map((account) => [account.key, account.id]),
    ) as DemoIds['accounts'],
    categories: Object.fromEntries(
      categories.map((category) => [category.name, category.id]),
    ),
  };

  const findAccount = async (_userId: string, id: string) => {
    const account = accounts.find((candidate) => candidate.id === id);
    if (!account) throw new NotFoundException();
    return account;
  };
  const accountsService = {
    assertActive: findAccount,
    assertOwned: findAccount,
  };
  // The create path's category checks read through whichever client it is
  // given (the caller's transaction or the service's own), so both fakes need it.
  const category = {
    findFirst: async ({ where }: { where: { id: string } }) =>
      categories.find((c) => c.id === where.id) ?? null,
  };
  const categoriesService = new CategoriesService({ category } as never);
  const ledgerService = new LedgerService(
    {} as never,
    accountsService as never,
  );

  const rows = new Map<string, Record<string, unknown>>();
  const items: (WrittenItem & { transactionId: string })[] = [];
  const db = {
    category,
    transaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `tx-${rows.size + 1}` };
        rows.set(row.id, row);
        return row;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        rows.get(where.id),
    },
    transactionItem: {
      createMany: async ({
        data,
      }: {
        data: (WrittenItem & { transactionId: string })[];
      }) => {
        items.push(...data);
      },
    },
  };
  const prisma = {
    category,
    $transaction: async (run: (client: typeof db) => unknown) => run(db),
  };
  const service = new TransactionsService(
    prisma as never,
    ledgerService,
    categoriesService,
    accountsService as never,
    { emit: jest.fn() } as never,
  );

  return {
    ids,
    async write(transaction: DemoTransactionPlan) {
      const created = (await service.create(
        'demo',
        toCreateCommand(transaction, ids),
      )) as unknown as { id: string };
      return items.filter((item) => item.transactionId === created.id);
    },
  };
}

describe('buildDemoPlan', () => {
  const plan = buildDemoPlan(NOW);
  const postings = allPostings(plan);

  it('is the same for the same day and seed, and differs for another seed', () => {
    expect(buildDemoPlan(NOW)).toEqual(plan);
    expect(buildDemoPlan(new Date(NOW))).toEqual(plan);
    expect(buildDemoPlan(NOW, 7).transactions).not.toEqual(plan.transactions);
  });

  it('covers the current month and the two before it, and nothing after now', () => {
    expect(plan.windowStart).toEqual(WINDOW_START);
    for (const posting of postings) {
      expect(posting.occurredAt.getTime()).toBeGreaterThanOrEqual(
        WINDOW_START.getTime(),
      );
      expect(posting.occurredAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
    const months = new Set(
      postings.map((posting) => posting.occurredAt.toISOString().slice(0, 7)),
    );
    expect([...months]).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('leaves out what would happen later today', () => {
    const early = buildDemoPlan(new Date('2026-10-25T00:30:00.000Z'));
    for (const posting of allPostings(early)) {
      expect(posting.occurredAt.getTime()).toBeLessThanOrEqual(
        early.now.getTime(),
      );
    }
  });

  it('uses positive amounts with two decimals, and splits add up to their total', () => {
    for (const posting of postings) {
      expect(posting.amount).toMatch(AMOUNT);
      expect(cents(posting.amount)).toBeGreaterThan(0);
      if (!posting.items) continue;
      for (const item of posting.items) {
        expect(item.amount).toMatch(AMOUNT);
        expect(cents(item.amount)).toBeGreaterThan(0);
      }
      expect(
        posting.items.reduce((sum, item) => sum + cents(item.amount), 0),
      ).toBe(cents(posting.amount));
    }
  });

  it('writes balanced ledger lines through the real create path', async () => {
    const writer = makeWriter(plan);
    for (const posting of postings) {
      const lines = await writer.write(posting);
      const from = posting.from && writer.ids.accounts[posting.from];
      const to = posting.to && writer.ids.accounts[posting.to];
      for (const line of lines) expect(line.currency).toBe(posting.currency);

      if (posting.type === TransactionType.TRANSFER) {
        expect(lines).toHaveLength(2);
        const signed = lines.reduce(
          (sum, line) =>
            sum +
            (line.direction === LedgerDirection.CREDIT ? 1 : -1) *
              cents(line.amount),
          0,
        );
        expect(signed).toBe(0);
        expect(lines.map((line) => [line.direction, line.accountId])).toEqual([
          [LedgerDirection.DEBIT, from],
          [LedgerDirection.CREDIT, to],
        ]);
        continue;
      }

      const direction =
        posting.type === TransactionType.INCOME
          ? LedgerDirection.CREDIT
          : LedgerDirection.DEBIT;
      expect(lines).toHaveLength(posting.items?.length ?? 1);
      for (const line of lines) {
        expect(line.direction).toBe(direction);
        expect(line.accountId).toBe(
          posting.type === TransactionType.INCOME ? to : from,
        );
      }
      expect(lines.reduce((sum, line) => sum + cents(line.amount), 0)).toBe(
        cents(posting.amount),
      );
      if (posting.items) {
        expect(lines.map((line) => line.categoryId)).toEqual(
          posting.items.map((item) => writer.ids.categories[item.category]),
        );
      }
    }
  });

  it('pays the salary on the first business day and saves 600 each month', () => {
    const salaries = plan.transactions.filter((t) => t.category === 'Salary');
    expect(
      salaries.map((t) => t.occurredAt.toISOString().slice(0, 10)),
    ).toEqual(['2026-08-03', '2026-09-01', '2026-10-01']);
    for (const salary of salaries)
      expect(salary).toMatchObject({
        type: TransactionType.INCOME,
        amount: '4800.00',
        to: 'checking',
      });

    const savings = plan.transactions.filter(
      (t) => t.type === TransactionType.TRANSFER && t.to === 'savings',
    );
    expect(savings).toHaveLength(3);
  });

  it('runs rent as a monthly series with an occurrence each month since', () => {
    const [rent] = plan.recurring;
    expect(plan.recurring).toHaveLength(1);
    expect(rent.interval).toBe(RecurringInterval.MONTHLY);
    expect(rent.root).toMatchObject({
      category: 'Rent',
      from: 'checking',
      occurredAt: new Date('2026-08-01T08:00:00.000Z'),
    });
    expect(rent.root.items).toBeUndefined();
    expect(rent.occurrences).toEqual([
      new Date('2026-09-01T08:00:00.000Z'),
      new Date('2026-10-01T08:00:00.000Z'),
    ]);
    // The cursor the seed leaves on the series is the next one, still to come.
    expect(
      computeNextOccurrence(
        1,
        rent.occurrences[1],
        RecurringInterval.MONTHLY,
      ).getTime(),
    ).toBeGreaterThan(NOW.getTime());
  });

  it('includes a split, euro spending only on the travel account, and keeps that cash above zero', () => {
    expect(plan.transactions.some((t) => (t.items?.length ?? 0) > 1)).toBe(
      true,
    );

    const euros = plan.transactions.filter((t) => t.currency === 'EUR');
    expect(euros.length).toBeGreaterThan(5);
    for (const t of euros)
      expect(t).toMatchObject({
        type: TransactionType.EXPENSE,
        from: 'travel',
      });
    const travel = plan.accounts.find((account) => account.key === 'travel')!;
    const spent = euros.reduce((sum, t) => sum + cents(t.amount), 0);
    expect(cents(travel.openingBalance) - spent).toBeGreaterThanOrEqual(0);
  });

  it('buys groceries two or three times a week on the card', () => {
    const groceries = plan.transactions.filter(
      (t) => t.category === 'Groceries' && t.from === 'card',
    );
    const weeks = Math.ceil(
      (NOW.getTime() - WINDOW_START.getTime()) / (7 * 86_400_000),
    );
    expect(groceries.length).toBeGreaterThanOrEqual(2 * (weeks - 1));
    expect(groceries.length).toBeLessThanOrEqual(3 * weeks);
  });

  it('pays the card off each month: the opening debt, then the previous month', () => {
    const payments = plan.transactions.filter((t) => t.to === 'card');
    expect(
      payments.map((t) => t.occurredAt.toISOString().slice(0, 10)),
    ).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    expect(payments[0].amount).toBe('420.00');
    const august = plan.transactions
      .filter(
        (t) =>
          t.from === 'card' && t.occurredAt.toISOString().startsWith('2026-08'),
      )
      .reduce((sum, t) => sum + cents(t.amount), 0);
    expect(cents(payments[1].amount)).toBe(august);
  });

  it('sets up the three goals on accounts the plan creates', () => {
    const keys = plan.accounts.map((account) => account.key);
    expect(
      plan.goals.map((goal) => [
        goal.name,
        goal.type,
        goal.account,
        goal.targetAmount,
      ]),
    ).toEqual([
      ['Emergency fund', 'BALANCE', 'savings', '10000.00'],
      ['Groceries budget', 'EXPENSE', 'card', '600.00'],
      ['Side income', 'INCOME', 'savings', '500.00'],
    ]);
    for (const goal of plan.goals) {
      expect(keys).toContain(goal.account);
      expect(goal.periodStart).toBe('2026-08-01');
      expect(
        goal.isRecurring ? goal.recurrenceUnit : goal.periodEnd,
      ).toBeDefined();
    }
  });

  it('summarizes every posting once per month', () => {
    const summary = summarizePlan(plan);
    expect(summary.total).toBe(postings.length);
    expect(Object.values(summary.byMonth).reduce((a, b) => a + b, 0)).toBe(
      postings.length,
    );
  });
});

describe.each([
  '2026-01-01T00:00:00.000Z',
  '2026-03-01T09:00:00.000Z',
  '2026-02-28T23:59:59.999Z',
  '2027-05-31T12:00:00.000Z',
])('buildDemoPlan on %s', (iso) => {
  const now = new Date(iso);
  const plan = buildDemoPlan(now);

  it('stays inside its window and posts through the create path', async () => {
    const writer = makeWriter(plan);
    for (const posting of allPostings(plan)) {
      expect(posting.occurredAt.getTime()).toBeGreaterThanOrEqual(
        plan.windowStart.getTime(),
      );
      expect(posting.occurredAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(await writer.write(posting)).not.toHaveLength(0);
    }
  });
});

describe('toCreateCommand', () => {
  it('refuses a plan that names an account or category that does not exist', () => {
    const ids: DemoIds = {
      accounts: { checking: 'a', savings: 'b', card: 'c', travel: 'd' },
      categories: {},
    };
    const transaction: DemoTransactionPlan = {
      type: TransactionType.EXPENSE,
      description: 'x',
      amount: '1.00',
      currency: 'USD',
      occurredAt: NOW,
      from: 'checking',
      category: 'Nope',
    };
    expect(() => toCreateCommand(transaction, ids)).toThrow(
      'unknown category: Nope',
    );
  });
});

describe('createRandom', () => {
  it('repeats for a seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect(Array.from({ length: 5 }, a.next)).toEqual(
      Array.from({ length: 5 }, b.next),
    );
  });
});

describe('demoSeedRefusal', () => {
  it('refuses production unless explicitly allowed', () => {
    expect(demoSeedRefusal({ NODE_ENV: 'production' })).toMatch(
      /ALLOW_DEMO_SEED/,
    );
    expect(
      demoSeedRefusal({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' }),
    ).toBeNull();
    expect(demoSeedRefusal({ NODE_ENV: 'development' })).toBeNull();
    expect(demoSeedRefusal({})).toBeNull();
  });
});
