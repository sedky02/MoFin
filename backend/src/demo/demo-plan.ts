import {
  AccountType,
  CategoryType,
  GoalRecurrenceUnit,
  GoalType,
  RecurringInterval,
  TransactionType,
} from '@prisma/client';
import { computeNextOccurrence } from '../modules/transactions/transactions.service';
import { CreateTransactionCommand } from '../modules/transactions/dto/transactions.dto';

/**
 * The demo account's data, as a plain list: what the seed writes, with no
 * database involved. Accounts and categories are referenced by key and name;
 * the writer swaps in the ids once they exist. Everything is derived from
 * `now` and a fixed seed, so the same day always produces the same data.
 *
 * The plan covers the current month and the two before it (so every month on
 * a chart is a full one except the current), and never goes past `now`.
 */

export const DEMO_EMAIL = 'demo@mofin.app';
export const DEMO_DISPLAY_NAME = 'Alex Demo';
export const DEMO_DEFAULT_PASSWORD = 'DemoPassw0rd!';
export const DEMO_SEED = 20261025;

export type DemoAccountKey = 'checking' | 'savings' | 'card' | 'travel';

export interface DemoAccountPlan {
  key: DemoAccountKey;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: string;
}

export interface DemoSplitLine {
  amount: string;
  category: string;
  memo?: string;
}

export interface DemoTransactionPlan {
  type: TransactionType;
  description: string;
  amount: string;
  currency: string;
  occurredAt: Date;
  from?: DemoAccountKey;
  to?: DemoAccountKey;
  category?: string;
  items?: DemoSplitLine[];
}

/** A recurring series: its root (the first posting) and the occurrences generated since. */
export interface DemoRecurringPlan {
  root: DemoTransactionPlan;
  interval: RecurringInterval;
  occurrences: Date[];
}

export interface DemoGoalPlan {
  name: string;
  type: GoalType;
  account: DemoAccountKey;
  targetAmount: string;
  isRecurring: boolean;
  recurrenceUnit?: GoalRecurrenceUnit;
  periodStart: string;
  periodEnd?: string;
}

export interface DemoPlan {
  windowStart: Date;
  now: Date;
  /** Created on top of the default categories every new user gets. */
  extraCategories: { name: string; type: CategoryType; color: string }[];
  accounts: DemoAccountPlan[];
  transactions: DemoTransactionPlan[];
  recurring: DemoRecurringPlan[];
  goals: DemoGoalPlan[];
}

const ACCOUNTS: DemoAccountPlan[] = [
  {
    key: 'checking',
    name: 'Everyday checking',
    type: AccountType.BANK,
    currency: 'USD',
    openingBalance: '2350.00',
  },
  {
    key: 'savings',
    name: 'Savings',
    type: AccountType.SAVINGS,
    currency: 'USD',
    openingBalance: '5800.00',
  },
  // The enum has no credit type; a card is a bank account that starts in debt.
  {
    key: 'card',
    name: 'Credit card',
    type: AccountType.BANK,
    currency: 'USD',
    openingBalance: '-420.00',
  },
  {
    key: 'travel',
    name: 'Euro travel',
    type: AccountType.CASH,
    currency: 'EUR',
    openingBalance: '300.00',
  },
];

const CARD_OPENING_DEBT_CENTS = 42000;
const TRAVEL_BUDGET_CENTS = 28000;

/** Merchants with the range (in cents) a visit usually costs. */
type Merchant = readonly [name: string, min: number, max: number];

const GROCERS: Merchant[] = [
  ['Whole Foods', 3200, 7400],
  ['Safeway', 2200, 6200],
  ['Kroger', 2400, 6800],
  ['Aldi', 1800, 4600],
  ['Sprouts', 2000, 5200],
];
const RESTAURANTS: Merchant[] = [
  ['Starbucks', 450, 1250],
  ['Blue Bottle Coffee', 500, 1400],
  ['Chipotle', 1150, 2400],
  ['Sweetgreen', 1300, 2600],
  ['Shake Shack', 1400, 3200],
  ['Thai Basil', 2400, 5800],
  ['Panera Bread', 1100, 2600],
];
const PARIS_DINING: Merchant[] = [
  ['Boulangerie', 600, 1400],
  ['Café terrace', 800, 2200],
  ['Bistro dinner', 2400, 4800],
  ['Crêperie', 1000, 2200],
];

/** mulberry32: a tiny seeded generator, so the same seed gives the same data. */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)],
    /** `count` distinct integers in [min, max], ascending. */
    distinct(count: number, min: number, max: number): number[] {
      const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      const chosen: number[] = [];
      while (chosen.length < count && pool.length)
        chosen.push(pool.splice(int(0, pool.length - 1), 1)[0]);
      return chosen.sort((a, b) => a - b);
    },
  };
}

/** Whole cents to a 2-decimal amount string ("1234.50"). */
export function toAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function atTime(day: Date, hour: number, minute = 0): Date {
  return new Date(day.getTime() + (hour * 60 + minute) * 60_000);
}

function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * 86_400_000);
}

function isWeekend(day: Date): boolean {
  return day.getUTCDay() === 0 || day.getUTCDay() === 6;
}

function firstBusinessDay(monthStart: Date): Date {
  let day = monthStart;
  while (isWeekend(day)) day = addDays(day, 1);
  return day;
}

function ymd(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function sameMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

export function buildDemoPlan(now: Date, seed = DEMO_SEED): DemoPlan {
  const random = createRandom(seed);
  const windowStart = utcDay(now.getUTCFullYear(), now.getUTCMonth() - 2, 1);
  const today = utcDay(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const months = [0, 1, 2].map((i) =>
    utcDay(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + i, 1),
  );

  const transactions: DemoTransactionPlan[] = [];
  // Anything that would land after `now` (later today, or a day still to
  // come this month) is left out rather than moved, so the data stays stable.
  const add = (transaction: DemoTransactionPlan) => {
    if (transaction.occurredAt <= now) transactions.push(transaction);
  };
  const expense = (
    from: DemoAccountKey,
    description: string,
    cents: number,
    category: string,
    occurredAt: Date,
    currency = 'USD',
  ) =>
    add({
      type: TransactionType.EXPENSE,
      description,
      amount: toAmount(cents),
      currency,
      occurredAt,
      from,
      category,
    });
  const visit = (
    merchants: readonly Merchant[],
    from: DemoAccountKey,
    category: string,
    day: Date,
    hours: [number, number],
  ) => {
    const [name, min, max] = random.pick(merchants);
    expense(
      from,
      name,
      random.int(min, max),
      category,
      atTime(day, random.int(hours[0], hours[1]), random.int(0, 59)),
    );
  };

  let invoice = 1041;
  months.forEach((month, index) => {
    const day = (n: number) => addDays(month, n - 1);

    add({
      type: TransactionType.INCOME,
      description: 'Salary · Northwind Ltd',
      amount: '4800.00',
      currency: 'USD',
      occurredAt: atTime(firstBusinessDay(month), 6),
      to: 'checking',
      category: 'Salary',
    });
    add({
      type: TransactionType.TRANSFER,
      description: 'Monthly savings',
      amount: '600.00',
      currency: 'USD',
      occurredAt: atTime(day(3), 9),
      from: 'checking',
      to: 'savings',
    });

    // Side work, paid into savings: one or two invoices a month.
    for (const payDay of random.distinct(random.int(1, 3), 6, 26)) {
      add({
        type: TransactionType.INCOME,
        description: `Freelance invoice #${invoice++}`,
        amount: toAmount(random.int(150, 450) * 100),
        currency: 'USD',
        occurredAt: atTime(day(payDay), 14),
        to: 'savings',
        category: 'Freelance',
      });
    }

    expense(
      'checking',
      'FitLife Gym',
      3999,
      'Subscriptions',
      atTime(day(2), 7),
    );
    expense('checking', 'Netflix', 1549, 'Subscriptions', atTime(day(8), 4));
    expense('checking', 'Spotify', 1199, 'Subscriptions', atTime(day(14), 4));
    expense(
      'checking',
      'Mobile phone plan',
      4500,
      'Subscriptions',
      atTime(day(18), 5),
    );
    expense(
      'checking',
      'City Power & Light',
      random.int(6800, 11800),
      'Utilities',
      atTime(day(12), 5),
    );
    expense(
      'checking',
      'Fiber internet',
      6000,
      'Utilities',
      atTime(day(15), 5),
    );
    expense(
      'checking',
      'Water & sewer',
      random.int(3200, 4800),
      'Utilities',
      atTime(day(22), 5),
    );

    // The monthly bulk run, split between food and household supplies.
    const groceries = random.int(6000, 11000);
    const household = random.int(2500, 6000);
    add({
      type: TransactionType.EXPENSE,
      description: 'Costco',
      amount: toAmount(groceries + household),
      currency: 'USD',
      occurredAt: atTime(day(random.int(9, 16)), 11, random.int(0, 59)),
      from: 'card',
      items: [
        { amount: toAmount(groceries), category: 'Groceries' },
        {
          amount: toAmount(household),
          category: 'Household',
          memo: 'Cleaning supplies and paper goods',
        },
      ],
    });

    // A week in Paris in the middle month, paid from the euro cash.
    if (index === 1) {
      let spent = 0;
      const spendEur = (
        description: string,
        cents: number,
        category: string,
        occurredAt: Date,
      ) => {
        if (spent + cents > TRAVEL_BUDGET_CENTS) return;
        spent += cents;
        expense('travel', description, cents, category, occurredAt, 'EUR');
      };
      spendEur('Paris Metro tickets', 1690, 'Transport', atTime(day(12), 9));
      for (let n = 12; n <= 17; n++) {
        for (const hour of random.distinct(random.int(1, 2), 8, 20)) {
          const [name, min, max] = random.pick(PARIS_DINING);
          spendEur(
            name,
            random.int(min, max),
            'Dining out',
            atTime(day(n), hour, random.int(0, 59)),
          );
        }
      }
      spendEur(
        'Carrefour City',
        random.int(1800, 3200),
        'Groceries',
        atTime(day(14), 18),
      );
      spendEur('Taxi to the airport', 2600, 'Transport', atTime(day(17), 6));
    }
  });

  // Weekly habits: groceries on the card, eating out and getting around from checking.
  for (
    let weekStart = windowStart, week = 0;
    weekStart <= today;
    weekStart = addDays(weekStart, 7), week++
  ) {
    for (const offset of random.distinct(random.int(2, 3), 0, 6)) {
      visit(GROCERS, 'card', 'Groceries', addDays(weekStart, offset), [9, 19]);
    }
    for (const offset of random.distinct(random.int(1, 3), 0, 6)) {
      visit(
        RESTAURANTS,
        'checking',
        'Dining out',
        addDays(weekStart, offset),
        [8, 21],
      );
    }
    for (const offset of random.distinct(random.int(0, 2), 0, 6)) {
      expense(
        'checking',
        'Uber',
        random.int(900, 3400),
        'Transport',
        atTime(
          addDays(weekStart, offset),
          random.int(7, 23),
          random.int(0, 59),
        ),
      );
    }
    if (week % 2 === 0) {
      expense(
        'checking',
        'Shell',
        random.int(3800, 6200),
        'Transport',
        atTime(addDays(weekStart, random.int(0, 6)), 17, random.int(0, 59)),
      );
    }
  }

  // The card is paid off on the 5th: the opening debt first, then each
  // previous month's spending, so its balance only ever carries one month.
  months.forEach((month, index) => {
    const statementCents =
      index === 0
        ? CARD_OPENING_DEBT_CENTS
        : transactions
            .filter(
              (t) =>
                t.from === 'card' && sameMonth(t.occurredAt, months[index - 1]),
            )
            .reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0);
    if (statementCents <= 0) return;
    add({
      type: TransactionType.TRANSFER,
      description: 'Credit card payment',
      amount: toAmount(statementCents),
      currency: 'USD',
      occurredAt: atTime(addDays(month, 4), 10),
      from: 'checking',
      to: 'card',
    });
  });

  transactions.sort(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.description.localeCompare(b.description),
  );

  // Rent as a monthly series started on the first day of the window, with the
  // occurrences the nightly job would have posted since.
  const rentRoot: DemoTransactionPlan = {
    type: TransactionType.EXPENSE,
    description: 'Rent · Maple Street apartment',
    amount: '1850.00',
    currency: 'USD',
    occurredAt: atTime(windowStart, 8),
    from: 'checking',
    category: 'Rent',
  };
  const occurrences: Date[] = [];
  for (
    let next = computeNextOccurrence(
      rentRoot.occurredAt.getUTCDate(),
      rentRoot.occurredAt,
      RecurringInterval.MONTHLY,
    );
    next <= now;
    next = computeNextOccurrence(
      rentRoot.occurredAt.getUTCDate(),
      next,
      RecurringInterval.MONTHLY,
    )
  ) {
    occurrences.push(next);
  }

  const goalEnd = utcDay(
    windowStart.getUTCFullYear(),
    windowStart.getUTCMonth() + 12,
    0,
  );
  const goals: DemoGoalPlan[] = [
    {
      name: 'Emergency fund',
      type: GoalType.BALANCE,
      account: 'savings',
      targetAmount: '10000.00',
      isRecurring: false,
      periodStart: ymd(windowStart),
      periodEnd: ymd(goalEnd),
    },
    // Goals count everything of their type on one account, so the grocery cap
    // sits on the card, which only carries groceries and the monthly bulk run.
    {
      name: 'Groceries budget',
      type: GoalType.EXPENSE,
      account: 'card',
      targetAmount: '600.00',
      isRecurring: true,
      recurrenceUnit: GoalRecurrenceUnit.MONTH,
      periodStart: ymd(windowStart),
    },
    // Salary lands in checking, so freelance income is paid into savings and
    // this goal tracks only that.
    {
      name: 'Side income',
      type: GoalType.INCOME,
      account: 'savings',
      targetAmount: '500.00',
      isRecurring: true,
      recurrenceUnit: GoalRecurrenceUnit.MONTH,
      periodStart: ymd(windowStart),
    },
  ];

  return {
    windowStart,
    now,
    extraCategories: [
      { name: 'Household', type: CategoryType.EXPENSE, color: '#a855f7' },
    ],
    accounts: ACCOUNTS.map((account) => ({ ...account })),
    transactions,
    recurring: [
      { root: rentRoot, interval: RecurringInterval.MONTHLY, occurrences },
    ],
    goals,
  };
}

/** Ids of what the writer created, by plan key and category name. */
export interface DemoIds {
  accounts: Record<DemoAccountKey, string>;
  categories: Record<string, string>;
}

function idOf(
  ids: Record<string, string>,
  key: string | undefined,
  kind: string,
): string | undefined {
  if (key === undefined) return undefined;
  const id = ids[key];
  if (!id) throw new Error(`Demo plan refers to an unknown ${kind}: ${key}`);
  return id;
}

/** The command TransactionsService.create takes for a planned transaction. */
export function toCreateCommand(
  transaction: DemoTransactionPlan,
  ids: DemoIds,
): CreateTransactionCommand {
  return {
    type: transaction.type,
    description: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt,
    fromAccountId: idOf(ids.accounts, transaction.from, 'account'),
    toAccountId: idOf(ids.accounts, transaction.to, 'account'),
    categoryId: idOf(ids.categories, transaction.category, 'category'),
    items: transaction.items?.map((item) => ({
      amount: item.amount,
      categoryId: idOf(ids.categories, item.category, 'category'),
      memo: item.memo,
    })),
  };
}

/** Every posting the plan makes, recurring root and occurrences included, in date order. */
export function allPostings(plan: DemoPlan): DemoTransactionPlan[] {
  const series = plan.recurring.flatMap(({ root, occurrences }) => [
    root,
    ...occurrences.map((occurredAt) => ({ ...root, occurredAt })),
  ]);
  return [...plan.transactions, ...series].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
}

/** Posting counts per account, category and month, for the seed's summary. */
export function summarizePlan(plan: DemoPlan) {
  const byAccount: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const bump = (counts: Record<string, number>, key: string) =>
    (counts[key] = (counts[key] ?? 0) + 1);
  const accountName = (key: DemoAccountKey) =>
    plan.accounts.find((account) => account.key === key)!.name;

  const postings = allPostings(plan);
  for (const posting of postings) {
    for (const key of new Set([posting.from, posting.to]))
      if (key) bump(byAccount, accountName(key));
    const categories = posting.items?.map((item) => item.category) ?? [
      posting.category ?? 'Transfer',
    ];
    for (const category of new Set(categories)) bump(byCategory, category);
    bump(byMonth, posting.occurredAt.toISOString().slice(0, 7));
  }
  return { total: postings.length, byAccount, byCategory, byMonth };
}

/**
 * The seed refuses to run against production unless it's asked for
 * explicitly: it creates a user with a known password.
 */
export function demoSeedRefusal(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEMO_SEED !== 'true') {
    return 'Refusing to seed the demo account with NODE_ENV=production. Set ALLOW_DEMO_SEED=true to override.';
  }
  return null;
}
