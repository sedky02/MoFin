import { BadRequestException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import {
  accountUsage,
  categoryFromHistory,
  DraftCompleter,
  pickDefaultAccount,
} from './draft-completer';

const NOW = new Date('2026-11-06T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

type History = Array<{ description: string; categoryId: string | null }>;

const FOOD = { id: 'food', name: 'Food', type: 'EXPENSE' };
const DRINKS = { id: 'drinks', name: 'Drinks', type: 'EXPENSE' };
const TRANSPORT = { id: 'transport', name: 'Transport', type: 'EXPENSE' };
const SUBS = { id: 'subs', name: 'Subscriptions', type: 'EXPENSE' };
const RENT = { id: 'rent', name: 'Rent', type: 'EXPENSE' };
const SALARY = { id: 'salary', name: 'Salary', type: 'INCOME' };
const FREELANCE = { id: 'freelance', name: 'Freelance', type: 'INCOME' };
const CATEGORIES = [FOOD, DRINKS, TRANSPORT, SUBS, RENT, SALARY, FREELANCE];
const EXPENSE_IDS = new Set(['food', 'drinks', 'transport', 'subs', 'rent']);
const INCOME_IDS = new Set(['salary', 'freelance']);

/** A user's past transactions: what they bought, and where they filed it. */
const HISTORY: History = [
  { description: 'Starbucks latte', categoryId: 'drinks' },
  { description: 'Starbucks', categoryId: 'drinks' },
  { description: 'Coffee at Starbucks', categoryId: 'drinks' },
  { description: 'Uber to work', categoryId: 'transport' },
  { description: 'Uber home', categoryId: 'transport' },
  { description: 'Taxi', categoryId: 'transport' },
  { description: 'Netflix', categoryId: 'subs' },
  { description: 'Cafe', categoryId: 'drinks' },
  { description: 'Carrefour groceries', categoryId: 'food' },
  { description: 'Groceries Monoprix', categoryId: 'food' },
  { description: 'Monoprix', categoryId: 'food' },
  { description: 'Lunch with team', categoryId: 'food' },
  { description: 'Lunch', categoryId: 'food' },
  // The same shop, filed two ways: no clear answer for "Magasin general".
  { description: 'Magasin general', categoryId: 'food' },
  { description: 'Magasin general', categoryId: 'rent' },
  { description: 'Gift', categoryId: null },
];

const CASH = { id: 'cash', name: 'cash' };
const BANK = { id: 'bank', name: 'Bank' };
const SAVINGS = { id: 'savings', name: 'Savings' };

describe('pickDefaultAccount', () => {
  it('1. uses the saved main account first', () => {
    const usage = [{ accountId: 'bank', count: 9, lastAt: day(1) }];
    expect(pickDefaultAccount([CASH, BANK], 'cash', usage)).toBe('cash');
  });

  it('skips a saved account that is archived or gone', () => {
    const usage = [{ accountId: 'bank', count: 2, lastAt: day(1) }];
    expect(pickDefaultAccount([CASH, BANK], 'archived', usage)).toBe('bank');
  });

  it('2. otherwise uses the account with the most recent transactions', () => {
    const usage = [
      { accountId: 'cash', count: 2, lastAt: day(1) },
      { accountId: 'savings', count: 5, lastAt: day(20) },
    ];
    expect(pickDefaultAccount([CASH, BANK, SAVINGS], undefined, usage)).toBe(
      'savings',
    );
  });

  it('2. breaks a tie with the most recently used account', () => {
    const usage = [
      { accountId: 'cash', count: 3, lastAt: day(10) },
      { accountId: 'savings', count: 3, lastAt: day(2) },
    ];
    expect(pickDefaultAccount([CASH, BANK, SAVINGS], undefined, usage)).toBe(
      'savings',
    );
  });

  it('ignores usage of accounts that are no longer active', () => {
    const usage = [{ accountId: 'archived', count: 40, lastAt: day(1) }];
    expect(pickDefaultAccount([SAVINGS, CASH], undefined, usage)).toBe('cash');
  });

  it('3. falls back to the first account by name, ignoring case', () => {
    expect(pickDefaultAccount([SAVINGS, CASH, BANK], undefined, [])).toBe(
      'bank',
    );
  });

  it('has nothing to pick without accounts', () => {
    expect(pickDefaultAccount([], 'cash', [])).toBeUndefined();
  });
});

describe('accountUsage', () => {
  it('counts transactions per account, once per transaction, and keeps the latest date', () => {
    const usage = accountUsage([
      { occurredAt: day(5), items: [{ accountId: 'cash' }] },
      // A transfer counts for both sides.
      {
        occurredAt: day(1),
        items: [{ accountId: 'cash' }, { accountId: 'bank' }],
      },
      // Split rows on one account still count once.
      {
        occurredAt: day(3),
        items: [{ accountId: 'bank' }, { accountId: 'bank' }],
      },
    ]);
    expect(usage).toEqual(
      expect.arrayContaining([
        { accountId: 'cash', count: 2, lastAt: day(1) },
        { accountId: 'bank', count: 2, lastAt: day(1) },
      ]),
    );
  });
});

describe('DraftCompleter.complete', () => {
  type Recent = Array<{ occurredAt: Date; items: { accountId: string }[] }>;
  function setup(
    opts: {
      accounts?: Array<{ id: string; name: string }>;
      settings?: Record<string, unknown>;
      recent?: Recent;
      categories?: typeof CATEGORIES;
      history?: History;
    } = {},
  ) {
    const {
      accounts = [CASH, BANK, SAVINGS],
      settings = {},
      recent = [],
      categories = CATEGORIES,
      history = [],
    } = opts;
    const prisma = {
      account: { findMany: jest.fn(() => Promise.resolve(accounts)) },
      category: { findMany: jest.fn(() => Promise.resolve(categories)) },
      user: { findUnique: jest.fn(() => Promise.resolve({ settings })) },
      transaction: {
        // One query counts account usage, the other reads category history.
        findMany: jest.fn((args: { select: { description?: true } }) =>
          Promise.resolve(args.select.description ? history : recent),
        ),
      },
    };
    return { completer: new DraftCompleter(prisma as never), prisma };
  }
  const expense = { type: TransactionType.EXPENSE, description: 'Coffee' };

  it('keeps the account the user named', async () => {
    const { completer, prisma } = setup({
      settings: { mainAccountId: 'bank' },
    });
    const out = await completer.complete(
      'u1',
      { ...expense, fromAccountId: 'savings' },
      NOW,
    );
    expect(out.fromAccountId).toBe('savings');
    // Nothing to pick, so no extra queries.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an account id the user does not have, naming the real ones', async () => {
    const { completer } = setup();
    await expect(
      completer.complete('u1', { ...expense, fromAccountId: 'made-up' }, NOW),
    ).rejects.toThrow(BadRequestException);
    await expect(
      completer.complete('u1', { ...expense, fromAccountId: 'made-up' }, NOW),
    ).rejects.toThrow(/Bank \(bank\)/);
  });

  it('only looks at active accounts', async () => {
    const { completer, prisma } = setup();
    await completer.complete('u1', expense, NOW);
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', archivedAt: null } }),
    );
  });

  it('fills a missing expense account with the saved main account', async () => {
    const { completer } = setup({ settings: { mainAccountId: 'bank' } });
    const out = await completer.complete('u1', expense, NOW);
    expect(out).toMatchObject({
      fromAccountId: 'bank',
      toAccountId: undefined,
    });
  });

  it('fills income into the most used account of the last 30 days', async () => {
    const { completer, prisma } = setup({
      recent: [
        { occurredAt: day(2), items: [{ accountId: 'savings' }] },
        { occurredAt: day(4), items: [{ accountId: 'savings' }] },
        { occurredAt: day(1), items: [{ accountId: 'cash' }] },
      ],
    });
    const out = await completer.complete(
      'u1',
      { type: TransactionType.INCOME, description: 'Salary' },
      NOW,
    );
    expect(out).toMatchObject({
      toAccountId: 'savings',
      fromAccountId: undefined,
    });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          deletedAt: null,
          occurredAt: { gte: day(30), lte: NOW },
        },
      }),
    );
  });

  it('falls back to the first account by name with no saved account and no history', async () => {
    const { completer } = setup();
    const out = await completer.complete('u1', expense, NOW);
    expect(out.fromAccountId).toBe('bank');
  });

  it("fills a transfer's source, but never the same account as its destination", async () => {
    const { completer } = setup({ settings: { mainAccountId: 'bank' } });
    const filled = await completer.complete(
      'u1',
      {
        type: TransactionType.TRANSFER,
        description: 'Save',
        toAccountId: 'savings',
      },
      NOW,
    );
    expect(filled).toMatchObject({
      fromAccountId: 'bank',
      toAccountId: 'savings',
    });
    const same = await completer.complete(
      'u1',
      {
        type: TransactionType.TRANSFER,
        description: 'Move',
        toAccountId: 'bank',
      },
      NOW,
    );
    expect(same.fromAccountId).toBeUndefined();
  });

  it('leaves the account empty when the user has no active accounts', async () => {
    const { completer } = setup({ accounts: [] });
    const out = await completer.complete('u1', expense, NOW);
    expect(out.fromAccountId).toBeUndefined();
  });
});

/**
 * Description -> expected category, from the history above. `undefined` is
 * "no confident match": the draft is left without a category (MoFin has no
 * "Uncategorized" category to fall back to).
 */
describe('categoryFromHistory', () => {
  const cases: Array<[string, string | undefined, string]> = [
    // Exact past descriptions: one is enough.
    ['Netflix', 'subs', 'same description once'],
    ['starbucks', 'drinks', 'same words, other case'],
    ['Monoprix 45 TND', 'food', 'amounts and currency ignored'],
    // Merchant or item shared with several past transactions.
    ['Starbucks cappuccino', 'drinks', 'merchant seen three times'],
    ['Uber to the airport', 'transport', 'merchant seen twice'],
    ['Groceries at Carrefour', 'food', 'words in another order'],
    ['grocery run', 'food', 'singular of groceries'],
    ['Team lunch', 'food', 'item seen twice'],
    ['Café', 'drinks', 'accents ignored: matches a past "Cafe"'],
    // Ambiguous or unknown.
    ['Magasin general', undefined, 'same words filed two ways'],
    ['Taxi', 'transport', 'one exact match'],
    ['Taxis downtown', undefined, 'only one related transaction'],
    ['Paid 20', undefined, 'no meaningful words'],
    ['Birthday present', undefined, 'never seen'],
    ['Gift', undefined, 'seen, but never categorised'],
  ];
  it.each(cases)('%s -> %s (%s)', (description, expected) => {
    expect(categoryFromHistory(description, HISTORY, EXPENSE_IDS)).toBe(
      expected,
    );
  });

  it('only suggests categories of the draft type', () => {
    expect(categoryFromHistory('Netflix', HISTORY, INCOME_IDS)).toBeUndefined();
  });

  it('needs a clear majority among related transactions', () => {
    const split: History = [
      { description: 'Amazon books', categoryId: 'food' },
      { description: 'Amazon cable', categoryId: 'subs' },
      { description: 'Amazon order', categoryId: 'rent' },
    ];
    expect(categoryFromHistory('Amazon', split, EXPENSE_IDS)).toBeUndefined();
  });
});

describe('DraftCompleter.complete categories', () => {
  function setup(history: History = HISTORY) {
    const prisma = {
      account: { findMany: jest.fn(() => Promise.resolve([CASH])) },
      category: { findMany: jest.fn(() => Promise.resolve(CATEGORIES)) },
      user: { findUnique: jest.fn(() => Promise.resolve({ settings: {} })) },
      transaction: {
        findMany: jest.fn((args: { select: { description?: true } }) =>
          Promise.resolve(args.select.description ? history : []),
        ),
      },
    };
    return { completer: new DraftCompleter(prisma as never), prisma };
  }
  const expense = (description: string, categoryId?: string) => ({
    type: TransactionType.EXPENSE,
    description,
    categoryId,
  });

  it("keeps the assistant's pick when history has nothing to say (a clear match)", async () => {
    const { completer } = setup([]);
    const out = await completer.complete('u1', expense('Pizza', 'food'), NOW);
    expect(out.categoryId).toBe('food');
  });

  it('prefers the category the user files similar descriptions under', async () => {
    const { completer } = setup();
    const out = await completer.complete(
      'u1',
      expense('Starbucks muffin', 'food'),
      NOW,
    );
    expect(out.categoryId).toBe('drinks');
  });

  it('fills the category from history when the assistant left it out', async () => {
    const { completer } = setup();
    const out = await completer.complete('u1', expense('Uber'), NOW);
    expect(out.categoryId).toBe('transport');
  });

  it('leaves the category empty with no pick and no clear history', async () => {
    const { completer } = setup();
    const out = await completer.complete('u1', expense('Magasin general'), NOW);
    expect(out.categoryId).toBeUndefined();
  });

  it('rejects an unknown category id, listing only the categories of the draft type', async () => {
    const { completer } = setup();
    const call = completer.complete('u1', expense('Pizza', 'made-up'), NOW);
    await expect(call).rejects.toThrow(BadRequestException);
    await expect(
      completer.complete('u1', expense('Pizza', 'made-up'), NOW),
    ).rejects.toThrow(/Unknown categoryId "made-up".*Food \(food\)/);
    await expect(
      completer.complete('u1', expense('Pizza', 'made-up'), NOW),
    ).rejects.not.toThrow(/Salary/);
  });

  it('rejects a category of the wrong type', async () => {
    const { completer } = setup();
    await expect(
      completer.complete('u1', expense('Pizza', 'salary'), NOW),
    ).rejects.toThrow(
      /"Salary" is an INCOME category, but this draft is EXPENSE/,
    );
  });

  it('reads history only for active categories of the draft type', async () => {
    const { completer, prisma } = setup();
    await completer.complete(
      'u1',
      {
        type: TransactionType.INCOME,
        description: 'Salary',
        categoryId: 'salary',
      },
      NOW,
    );
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId: 'u1' }, { userId: null }], archivedAt: null },
      }),
    );
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: TransactionType.INCOME,
          categoryId: { in: ['salary', 'freelance'] },
        }),
      }),
    );
  });

  it('drops a category sent with a transfer instead of rejecting it', async () => {
    const { completer } = setup();
    const out = await completer.complete(
      'u1',
      {
        type: TransactionType.TRANSFER,
        description: 'To savings',
        toAccountId: 'cash',
        fromAccountId: 'cash',
        categoryId: 'food',
      },
      NOW,
    );
    expect(out.categoryId).toBeUndefined();
  });
});
