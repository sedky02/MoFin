import { BadRequestException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import {
  accountUsage,
  DraftCompleter,
  pickDefaultAccount,
} from './draft-completer';

const NOW = new Date('2026-11-06T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

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
    } = {},
  ) {
    const {
      accounts = [CASH, BANK, SAVINGS],
      settings = {},
      recent = [],
    } = opts;
    const prisma = {
      account: { findMany: jest.fn(() => Promise.resolve(accounts)) },
      user: { findUnique: jest.fn(() => Promise.resolve({ settings })) },
      transaction: { findMany: jest.fn(() => Promise.resolve(recent)) },
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
