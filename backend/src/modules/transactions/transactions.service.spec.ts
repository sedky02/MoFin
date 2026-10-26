import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  RecurringInterval,
  RecurringStatus,
  TransactionType,
} from '@prisma/client';
import {
  computeNextOccurrence,
  firstOccurrenceOnOrAfter,
  isPastEndDate,
  TransactionsService,
} from './transactions.service';
import {
  CreateTransactionCommand,
  UpdateTransactionCommand,
} from './dto/transactions.dto';
import { CategoriesService } from '../categories/categories.service';

describe('TransactionsService.validateCommand', () => {
  // The cross-field rules run synchronously before any dependency is touched,
  // so bare stubs are enough to exercise them.
  const service = new TransactionsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const base: CreateTransactionCommand = {
    type: TransactionType.EXPENSE,
    description: 'x',
    amount: '10',
    currency: 'USD',
    occurredAt: new Date(),
    fromAccountId: 'a',
  };

  const expectReject = (command: CreateTransactionCommand) =>
    expect(service.create('u1', command)).rejects.toBeInstanceOf(
      BadRequestException,
    );

  it('rejects non-positive amounts', () =>
    expectReject({ ...base, amount: '0' }));

  it('rejects INCOME without toAccountId', () =>
    expectReject({
      ...base,
      type: TransactionType.INCOME,
      fromAccountId: undefined,
    }));

  it('rejects EXPENSE without fromAccountId', () =>
    expectReject({
      ...base,
      type: TransactionType.EXPENSE,
      fromAccountId: undefined,
    }));

  it('rejects TRANSFER missing an account', () =>
    expectReject({
      ...base,
      type: TransactionType.TRANSFER,
      toAccountId: undefined,
    }));

  it('rejects TRANSFER between identical accounts', () =>
    expectReject({
      ...base,
      type: TransactionType.TRANSFER,
      fromAccountId: 'a',
      toAccountId: 'a',
    }));

  it('rejects TRANSFER split into multiple items', () =>
    expectReject({
      ...base,
      type: TransactionType.TRANSFER,
      fromAccountId: 'a',
      toAccountId: 'b',
      items: [{ amount: '5' }, { amount: '5' }],
    }));

  it('rejects a split item with a non-positive amount', () =>
    expectReject({ ...base, items: [{ amount: '10' }, { amount: '0' }] }));

  it("rejects split items that don't add up to the transaction total", () =>
    expectReject({
      ...base,
      amount: '10',
      items: [{ amount: '4' }, { amount: '5' }],
    }));

  it('rejects a split that also carries a top-level category', async () => {
    const result = service.create('u1', {
      ...base,
      categoryId: 'groceries',
      items: [{ amount: '4', categoryId: 'groceries' }, { amount: '6' }],
    });
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(
      'A split transaction cannot have its own category',
    );
  });

  it('still accepts a top-level category on a single-item transaction', async () => {
    // Gets past validation and fails later, on the bare categories stub, not with the split error.
    const result = service.create('u1', {
      ...base,
      categoryId: 'groceries',
      items: [{ amount: '10' }],
    });
    await expect(result).rejects.not.toThrow(
      'A split transaction cannot have its own category',
    );
  });

  it('rejects recurring transactions with split items', () =>
    expectReject({
      ...base,
      isRecurring: true,
      recurringInterval: RecurringInterval.MONTHLY,
      items: [{ amount: '5' }, { amount: '5' }],
    }));

  it('rejects recurring transactions without recurringInterval', () =>
    expectReject({ ...base, isRecurring: true }));

  it('rejects a recurringEndDate at or before occurredAt', () =>
    expectReject({
      ...base,
      isRecurring: true,
      recurringInterval: RecurringInterval.MONTHLY,
      occurredAt: new Date('2026-01-01'),
      recurringEndDate: new Date('2026-01-01'),
    }));
});

describe('TransactionsService category type', () => {
  const categories: Record<
    string,
    { id: string; userId: string | null; name: string; type: string }
  > = {
    groceries: {
      id: 'groceries',
      userId: null,
      name: 'Groceries',
      type: 'EXPENSE',
    },
    salary: { id: 'salary', userId: 'u1', name: 'Salary', type: 'INCOME' },
  };

  // The real CategoriesService over a stubbed lookup; the ledger stub fails the
  // test if a rejected command ever got as far as building entries.
  function makeService() {
    const prisma = {
      category: {
        findFirst: jest.fn(
          async ({ where }: { where: { id: string } }) =>
            categories[where.id] ?? null,
        ),
      },
    };
    const ledgerService = { buildEntriesForCommand: jest.fn(async () => []) };
    const service = new TransactionsService(
      prisma as never,
      ledgerService as never,
      new CategoriesService(prisma as never),
      {} as never,
      {} as never,
    );
    return { service, ledgerService };
  }

  const income: CreateTransactionCommand = {
    type: TransactionType.INCOME,
    description: 'Refund',
    amount: '30',
    currency: 'USD',
    occurredAt: new Date(),
    toAccountId: 'a',
  };

  it('rejects INCOME filed under an EXPENSE category with a 400', async () => {
    const { service, ledgerService } = makeService();
    const result = service.create('u1', { ...income, categoryId: 'groceries' });
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(
      '"Groceries" is an expense category and cannot be used on an income transaction',
    );
    expect(ledgerService.buildEntriesForCommand).not.toHaveBeenCalled();
  });

  it('rejects an INCOME split whose item keeps an EXPENSE category', async () => {
    const { service, ledgerService } = makeService();
    await expect(
      service.create('u1', {
        ...income,
        items: [
          { amount: '10', categoryId: 'salary' },
          { amount: '20', categoryId: 'groceries' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ledgerService.buildEntriesForCommand).not.toHaveBeenCalled();
  });

  it('rejects a TRANSFER with any category', async () => {
    const { service, ledgerService } = makeService();
    const result = service.create('u1', {
      ...income,
      type: TransactionType.TRANSFER,
      fromAccountId: 'a',
      toAccountId: 'b',
      categoryId: 'groceries',
    });
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow('Transfers cannot have a category');
    expect(ledgerService.buildEntriesForCommand).not.toHaveBeenCalled();
  });

  it('lets INCOME through with an INCOME category', async () => {
    const { service, ledgerService } = makeService();
    // Past the category checks the stubbed prisma has no $transaction, so this
    // fails afterwards; reaching the ledger is what proves the category passed.
    await service
      .create('u1', { ...income, categoryId: 'salary' })
      .catch(() => undefined);
    expect(ledgerService.buildEntriesForCommand).toHaveBeenCalled();
  });

  it('rejects re-filing a recurring INCOME series under an EXPENSE category', async () => {
    const root = {
      id: 'r1',
      userId: 'u1',
      type: TransactionType.INCOME,
      isRecurring: true,
      parentTransactionId: null,
      recurringStatus: 'ACTIVE',
      recurringAmount: '30',
      recurringToAccountId: 'a',
      recurringFromAccountId: null,
    };
    const update = jest.fn();
    const prisma = {
      category: {
        findFirst: jest.fn(
          async ({ where }: { where: { id: string } }) =>
            categories[where.id] ?? null,
        ),
      },
      transaction: { findFirst: jest.fn(async () => root), update },
    };
    const service = new TransactionsService(
      prisma as never,
      {} as never,
      new CategoriesService(prisma as never),
      {
        assertOwned: jest.fn(async () => ({})),
        assertActive: jest.fn(async () => ({})),
      } as never,
      {} as never,
    );
    await expect(
      service.updateRecurring('u1', 'r1', { categoryId: 'groceries' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('computeNextOccurrence', () => {
  // UTC throughout (audit DATA-XX): a local-time constructor here would pass
  // or fail depending on the machine's TZ, exactly the bug being fixed. Every
  // date below is built with Date.UTC and every anchorDay comes from
  // getUTCDate(), mirroring the real callers.
  it('advances by one month, keeping the anchor day', () => {
    const next = computeNextOccurrence(
      15,
      new Date(Date.UTC(2026, 0, 15)),
      RecurringInterval.MONTHLY,
    );
    expect(next).toEqual(new Date(Date.UTC(2026, 1, 15)));
  });

  it('clamps to the last day of a shorter month', () => {
    const next = computeNextOccurrence(
      31,
      new Date(Date.UTC(2026, 0, 31)),
      RecurringInterval.MONTHLY,
    );
    expect(next).toEqual(new Date(Date.UTC(2026, 1, 28)));
  });

  it('recovers the anchor day once the target month is long enough again', () => {
    const next = computeNextOccurrence(
      31,
      new Date(Date.UTC(2026, 1, 28)),
      RecurringInterval.MONTHLY,
    );
    expect(next).toEqual(new Date(Date.UTC(2026, 2, 31)));
  });

  it('advances by one year for YEARLY, clamping Feb 29 in a non-leap year', () => {
    const next = computeNextOccurrence(
      29,
      new Date(Date.UTC(2024, 1, 29)),
      RecurringInterval.YEARLY,
    );
    expect(next).toEqual(new Date(Date.UTC(2025, 1, 28)));
  });

  it('is unaffected by the server TZ at a month boundary (23:30 on the 31st stays the 31st)', () => {
    // A transaction entered at 23:30 UTC on Jan 31st must still anchor to the
    // 31st and land on Feb 28th — not silently roll to Feb 1st because the
    // server happens to run in a timezone ahead of UTC.
    const lateOnThe31st = new Date(Date.UTC(2026, 0, 31, 23, 30));
    const next = computeNextOccurrence(
      lateOnThe31st.getUTCDate(),
      lateOnThe31st,
      RecurringInterval.MONTHLY,
    );
    expect(next).toEqual(new Date(Date.UTC(2026, 1, 28, 23, 30)));
  });
});

describe('isPastEndDate', () => {
  const next = new Date('2026-11-17T09:00:00Z');

  it('is inclusive: an occurrence landing exactly on the end date is still due', () => {
    expect(isPastEndDate(next, new Date('2026-11-17T09:00:00Z'))).toBe(false);
  });

  it('is true once the occurrence falls after the end date', () => {
    expect(isPastEndDate(next, new Date('2026-10-30T00:00:00Z'))).toBe(true);
  });

  it('never ends an open-ended series', () => {
    expect(isPastEndDate(next, null)).toBe(false);
    expect(isPastEndDate(next, undefined)).toBe(false);
  });
});

describe('TransactionsService recurring end date', () => {
  const createdOn = new Date('2026-10-17T09:00:00Z');
  const firstNext = new Date('2026-11-17T09:00:00Z');
  const rent: CreateTransactionCommand = {
    type: TransactionType.EXPENSE,
    description: 'Rent',
    amount: '1000',
    currency: 'USD',
    occurredAt: createdOn,
    fromAccountId: 'a1',
    isRecurring: true,
    recurringInterval: RecurringInterval.MONTHLY,
  };

  function setupCreate() {
    const db = {
      transaction: {
        create: jest.fn(async () => ({ id: 'r1' })),
        findUniqueOrThrow: jest.fn(async () => ({
          id: 'r1',
          occurredAt: createdOn,
          items: [],
        })),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof db) => unknown) => fn(db)),
    };
    const ledger = {
      buildEntriesForCommand: jest.fn(async () => []),
      createEntries: jest.fn(async () => undefined),
    };
    const categories = { assertAssignable: jest.fn(async () => undefined) };
    const service = new TransactionsService(
      prisma as never,
      ledger as never,
      categories as never,
      {} as never,
      { emit: jest.fn() } as never,
    );
    const written = () =>
      (
        db.transaction.create.mock.calls[0] as unknown as [
          { data: Record<string, unknown> },
        ]
      )[0].data;
    return { service, written };
  }

  it('starts a series ended when its end date falls before the first next occurrence', async () => {
    const { service, written } = setupCreate();
    await service.create('u1', {
      ...rent,
      recurringEndDate: new Date('2026-10-30T00:00:00Z'),
    });
    expect(written()).toMatchObject({
      recurringStatus: RecurringStatus.CANCELLED,
      nextOccurrenceAt: null,
    });
  });

  it('keeps a series active when the end date is exactly the first next occurrence', async () => {
    const { service, written } = setupCreate();
    await service.create('u1', { ...rent, recurringEndDate: firstNext });
    expect(written()).toMatchObject({
      recurringStatus: RecurringStatus.ACTIVE,
      nextOccurrenceAt: firstNext,
    });
  });

  it('keeps an open-ended series active', async () => {
    const { service, written } = setupCreate();
    await service.create('u1', rent);
    expect(written()).toMatchObject({
      recurringStatus: RecurringStatus.ACTIVE,
      nextOccurrenceAt: firstNext,
    });
  });

  const root = {
    id: 'r1',
    userId: 'u1',
    type: TransactionType.EXPENSE,
    currency: 'USD',
    occurredAt: createdOn,
    isRecurring: true,
    parentTransactionId: null,
    deletedAt: null,
    recurringStatus: RecurringStatus.ACTIVE,
    recurringInterval: RecurringInterval.MONTHLY,
    recurringAmount: '1000',
    recurringFromAccountId: 'a1',
    recurringToAccountId: null,
    recurringEndDate: new Date('2027-06-30T00:00:00Z'),
    nextOccurrenceAt: firstNext,
  };

  function setupUpdate(found: unknown = root) {
    const update = jest.fn(async () => ({}));
    const prisma = {
      transaction: { findFirst: jest.fn(async () => found), update },
    };
    const accounts = {
      assertOwned: jest.fn(async () => ({
        name: 'Checking',
        currency: 'USD',
        archivedAt: null,
      })),
    };
    const service = new TransactionsService(
      prisma as never,
      {} as never,
      {} as never,
      accounts as never,
      {} as never,
    );
    const written = () =>
      (
        update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
      )[0].data;
    return { service, update, written };
  }

  it('ends the series when an edit moves the end date before the next occurrence', async () => {
    const { service, written } = setupUpdate();
    await service.updateRecurring('u1', 'r1', {
      recurringEndDate: new Date('2026-10-30T00:00:00Z'),
    });
    expect(written()).toMatchObject({
      recurringEndDate: new Date('2026-10-30T00:00:00Z'),
      recurringStatus: RecurringStatus.CANCELLED,
      nextOccurrenceAt: null,
    });
  });

  it('keeps the series active when the edited end date is exactly the next occurrence', async () => {
    const { service, written } = setupUpdate();
    await service.updateRecurring('u1', 'r1', { recurringEndDate: firstNext });
    expect(written()).toMatchObject({ nextOccurrenceAt: firstNext });
    expect(written()).not.toHaveProperty('recurringStatus');
  });

  it('ends the series when an interval change pushes the next occurrence past the stored end date', async () => {
    const { service, written } = setupUpdate({
      ...root,
      recurringEndDate: new Date('2027-01-31T00:00:00Z'),
    });
    await service.updateRecurring('u1', 'r1', {
      recurringInterval: RecurringInterval.YEARLY,
    });
    expect(written()).toMatchObject({
      recurringStatus: RecurringStatus.CANCELLED,
      nextOccurrenceAt: null,
    });
  });

  it('leaves the series running when the end date is cleared or untouched', async () => {
    const cleared = setupUpdate();
    await cleared.service.updateRecurring('u1', 'r1', {
      recurringEndDate: null,
    });
    expect(cleared.written()).toMatchObject({
      recurringEndDate: null,
      nextOccurrenceAt: firstNext,
    });
    expect(cleared.written()).not.toHaveProperty('recurringStatus');

    const untouched = setupUpdate();
    await untouched.service.updateRecurring('u1', 'r1', {
      description: 'Rent (new flat)',
    });
    expect(untouched.written()).toMatchObject({ nextOccurrenceAt: firstNext });
    expect(untouched.written()).not.toHaveProperty('recurringStatus');
  });

  it('refuses to edit an ended series, so a later end date does not bring it back', async () => {
    const { service, update } = setupUpdate({
      ...root,
      recurringStatus: RecurringStatus.CANCELLED,
      nextOccurrenceAt: null,
    });
    await expect(
      service.updateRecurring('u1', 'r1', { recurringEndDate: null }),
    ).rejects.toThrow('Cannot edit a cancelled recurring series');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('TransactionsService edit, delete and restore', () => {
  const existing = {
    id: 't1',
    userId: 'u1',
    type: TransactionType.EXPENSE,
    description: 'Groceries',
    currency: 'USD',
    categoryId: 'c1',
    occurredAt: new Date('2026-03-10T10:00:00Z'),
    isRecurring: false,
    parentTransactionId: null,
    deletedAt: null,
  };
  const edit: UpdateTransactionCommand = {
    type: TransactionType.EXPENSE,
    description: 'Groceries (fixed)',
    amount: '45.50',
    currency: 'USD',
    occurredAt: new Date('2026-04-02T09:00:00Z'),
    fromAccountId: 'a1',
  };
  const entries = [
    {
      accountId: 'a1',
      direction: 'DEBIT',
      amount: '45.50',
      currency: 'USD',
      memo: 'Groceries (fixed)',
    },
  ];

  function setup(overrides: { found?: unknown; claimed?: number } = {}) {
    // The re-read returns whatever the claim wrote, like the database would.
    let written: Record<string, unknown> = {};
    const db = {
      transaction: {
        updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
          written = args.data;
          return { count: overrides.claimed ?? 1 };
        }),
        findUniqueOrThrow: jest.fn(async () => ({
          ...existing,
          ...written,
          items: [],
        })),
      },
      transactionItem: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    };
    const prisma = {
      transaction: {
        findFirst: jest.fn(async () =>
          'found' in overrides ? overrides.found : existing,
        ),
        updateMany: jest.fn(async () => ({ count: overrides.claimed ?? 1 })),
      },
      $transaction: jest.fn(async (fn: (t: typeof db) => unknown) => fn(db)),
    };
    const ledger = {
      buildEntriesForCommand: jest.fn(async () => entries),
      createEntries: jest.fn(async () => undefined),
    };
    const categories = { assertAssignable: jest.fn(async () => undefined) };
    const events = { emit: jest.fn() };
    const service = new TransactionsService(
      prisma as never,
      ledger as never,
      categories as never,
      {} as never,
      events as never,
    );
    const changedMonths = () =>
      events.emit.mock.calls
        .filter((c) => c[0] === 'transaction.changed')
        .map((c) =>
          (c[1] as { occurredAt: Date }).occurredAt.toISOString().slice(0, 7),
        );
    return { service, db, prisma, ledger, categories, events, changedMonths };
  }

  describe('update', () => {
    it('rewrites the fields and swaps the ledger lines in one database transaction', async () => {
      const { service, db, prisma, ledger } = setup();
      await service.update('u1', 't1', edit);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(db.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', userId: 'u1', deletedAt: null },
        data: {
          type: TransactionType.EXPENSE,
          description: 'Groceries (fixed)',
          currency: 'USD',
          // No category in the edit clears the old one rather than keeping it.
          categoryId: null,
          occurredAt: edit.occurredAt,
        },
      });
      expect(db.transactionItem.deleteMany).toHaveBeenCalledWith({
        where: { transactionId: 't1', userId: 'u1' },
      });
      expect(ledger.createEntries).toHaveBeenCalledWith(
        db,
        'u1',
        't1',
        entries,
      );
    });

    it('validates the new values like create does, before touching anything', async () => {
      const { service, prisma, ledger } = setup();
      await expect(
        service.update('u1', 't1', { ...edit, amount: '0' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.update('u1', 't1', {
          ...edit,
          categoryId: 'c1',
          items: [{ amount: '20' }, { amount: '25.50' }],
        }),
      ).rejects.toThrow('A split transaction cannot have its own category');
      expect(ledger.buildEntriesForCommand).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('checks the categories against the new type', async () => {
      const { service, categories } = setup();
      await service.update('u1', 't1', {
        ...edit,
        categoryId: 'c2',
        items: undefined,
      });
      expect(categories.assertAssignable).toHaveBeenCalledWith(
        'u1',
        TransactionType.EXPENSE,
        'c2',
      );
    });

    it('clears cached summaries for the month it left and the month it moved to', async () => {
      const moved = setup();
      await moved.service.update('u1', 't1', edit);
      expect(moved.changedMonths()).toEqual(['2026-03', '2026-04']);

      const sameMonth = setup();
      await sameMonth.service.update('u1', 't1', {
        ...edit,
        occurredAt: new Date('2026-03-20T09:00:00Z'),
      });
      expect(sameMonth.changedMonths()).toEqual(['2026-03']);
    });

    it('404s for an unknown, foreign or deleted transaction, and when a delete wins the race', async () => {
      const missing = setup({ found: null });
      await expect(missing.service.update('u1', 'nope', edit)).rejects.toThrow(
        'not found',
      );
      expect(missing.prisma.transaction.findFirst).toHaveBeenCalledWith({
        where: { id: 'nope', userId: 'u1', deletedAt: null },
      });

      const raced = setup({ claimed: 0 });
      await expect(raced.service.update('u1', 't1', edit)).rejects.toThrow(
        'not found',
      );
      expect(raced.db.transactionItem.deleteMany).not.toHaveBeenCalled();
    });

    it("keeps a recurring root's type and currency, which its series is generated from", async () => {
      const root = { ...existing, isRecurring: true };
      const typeChange = setup({ found: root });
      await expect(
        typeChange.service.update('u1', 't1', {
          ...edit,
          type: TransactionType.INCOME,
          toAccountId: 'a1',
        }),
      ).rejects.toThrow("can't change type");
      const currencyChange = setup({ found: root });
      await expect(
        currencyChange.service.update('u1', 't1', { ...edit, currency: 'EUR' }),
      ).rejects.toThrow("can't change currency");
      const split = setup({ found: root });
      await expect(
        split.service.update('u1', 't1', {
          ...edit,
          items: [{ amount: '20' }, { amount: '25.50' }],
        }),
      ).rejects.toThrow("can't be split");

      // A generated occurrence is an ordinary record: it can change type.
      const occurrence = setup({
        found: { ...root, parentTransactionId: 'root' },
      });
      await expect(
        occurrence.service.update('u1', 't1', {
          ...edit,
          type: TransactionType.INCOME,
          fromAccountId: undefined,
          toAccountId: 'a1',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('soft-deletes: stamps deletedAt only on a live row, and clears the cached month', async () => {
      const { service, prisma, changedMonths } = setup();
      await service.remove('u1', 't1');
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', userId: 'u1', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(changedMonths()).toEqual(['2026-03']);
    });

    it('404s for an unknown, foreign or already deleted transaction', async () => {
      const missing = setup({ found: null });
      await expect(missing.service.remove('u1', 'nope')).rejects.toThrow(
        'not found',
      );
      expect(missing.prisma.transaction.updateMany).not.toHaveBeenCalled();

      const raced = setup({ claimed: 0 });
      await expect(raced.service.remove('u1', 't1')).rejects.toThrow(
        'not found',
      );
      expect(raced.changedMonths()).toEqual([]);
    });
  });

  describe('restore', () => {
    it('clears deletedAt only on a deleted row and returns the transaction', async () => {
      const { service, prisma, changedMonths } = setup();
      const restored = await service.restore('u1', 't1');
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', userId: 'u1', deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      expect(restored).toMatchObject({ id: 't1' });
      expect(changedMonths()).toEqual(['2026-03']);
    });

    it("404s when there's no deleted transaction of this user with that id", async () => {
      const { service } = setup({ claimed: 0 });
      await expect(service.restore('u1', 't1')).rejects.toThrow(
        'Deleted transaction not found',
      );
    });
  });
});

describe('TransactionsService.getById', () => {
  function setup(found: unknown) {
    const prisma = { transaction: { findFirst: jest.fn(async () => found) } };
    const service = new TransactionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('loads each ledger leg with its account and category, scoped to the owner', async () => {
    const { service, prisma } = setup({ id: 't1', items: [] });
    await service.getById('u1', 't1');

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 't1', userId: 'u1', deletedAt: null },
      include: {
        items: { include: { category: true, account: true } },
        category: true,
      },
    });
  });

  it('404s for an unknown or foreign transaction', async () => {
    const { service } = setup(null);
    await expect(service.getById('u1', 'nope')).rejects.toThrow('not found');
  });
});

describe('firstOccurrenceOnOrAfter', () => {
  it('steps the cursor forward to the first occurrence on or after the day', () => {
    const from = new Date('2026-08-31T09:00:00Z');
    expect(
      firstOccurrenceOnOrAfter(
        31,
        from,
        RecurringInterval.MONTHLY,
        new Date('2026-10-25T00:00:00Z'),
      ).toISOString(),
    ).toBe('2026-10-31T09:00:00.000Z');
  });

  it('keeps an occurrence that falls on the day itself', () => {
    const from = new Date('2026-08-25T09:00:00Z');
    expect(
      firstOccurrenceOnOrAfter(
        25,
        from,
        RecurringInterval.MONTHLY,
        new Date('2026-10-25T00:00:00Z'),
      ).toISOString(),
    ).toBe('2026-10-25T09:00:00.000Z');
  });

  it('leaves a cursor that is already ahead where it is', () => {
    const from = new Date('2026-12-01T09:00:00Z');
    expect(
      firstOccurrenceOnOrAfter(
        1,
        from,
        RecurringInterval.MONTHLY,
        new Date('2026-10-25T00:00:00Z'),
      ),
    ).toBe(from);
  });
});

describe('TransactionsService paused series', () => {
  const accounts: Record<
    string,
    { id: string; name: string; currency: string; archivedAt: Date | null }
  > = {
    checking: {
      id: 'checking',
      name: 'Main checking',
      currency: 'USD',
      archivedAt: null,
    },
    savings: {
      id: 'savings',
      name: 'Savings',
      currency: 'USD',
      archivedAt: new Date('2026-10-01T00:00:00Z'),
    },
    dinar: { id: 'dinar', name: 'Dinar', currency: 'TND', archivedAt: null },
    emergency: {
      id: 'emergency',
      name: 'Emergency fund',
      currency: 'USD',
      archivedAt: null,
    },
  };

  const root = {
    id: 'r1',
    userId: 'u1',
    type: TransactionType.EXPENSE as TransactionType,
    description: 'Gym',
    currency: 'USD',
    categoryId: null as string | null,
    occurredAt: new Date('2026-01-15T09:00:00Z'),
    isRecurring: true,
    parentTransactionId: null,
    deletedAt: null,
    recurringStatus: RecurringStatus.ACTIVE as RecurringStatus,
    recurringInterval: RecurringInterval.MONTHLY,
    recurringAmount: '40',
    recurringFromAccountId: 'checking' as string | null,
    recurringToAccountId: null as string | null,
    recurringEndDate: null as Date | null,
    nextOccurrenceAt: new Date('2026-11-15T09:00:00Z') as Date | null,
    recurringError: null as string | null,
    lastFailedAt: null as Date | null,
  };
  const paused = {
    ...root,
    recurringStatus: RecurringStatus.PAUSED,
    recurringFromAccountId: 'savings',
    nextOccurrenceAt: new Date('2026-08-15T09:00:00Z'),
    recurringError: 'Account Savings is archived',
    lastFailedAt: new Date('2026-08-15T00:00:00Z'),
  };

  function setup(found: typeof root = root, claimed = 1) {
    const prisma = {
      transaction: {
        findFirst: jest.fn(async () => found),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: claimed })),
      },
    };
    const accountsService = {
      assertOwned: jest.fn(async (_userId: string, id: string) => {
        if (!accounts[id])
          throw new NotFoundException(`Account ${id} not found`);
        return accounts[id];
      }),
    };
    const categories = { assertAssignable: jest.fn(async () => undefined) };
    const service = new TransactionsService(
      prisma as never,
      {} as never,
      categories as never,
      accountsService as never,
      {} as never,
    );
    return { service, prisma, categories };
  }

  describe('updateRecurring', () => {
    it('400s with a field error when the new account is in another currency', async () => {
      const { service, prisma } = setup();
      const result = service.updateRecurring('u1', 'r1', {
        fromAccountId: 'dinar',
      });
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(result).rejects.toMatchObject({
        response: {
          errors: [
            {
              path: 'fromAccountId',
              message: 'Account Dinar is in TND, but the series is in USD',
            },
          ],
        },
      });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('400s with a field error when the account it posts from is archived, even if untouched', async () => {
      const { service, prisma } = setup({
        ...root,
        recurringFromAccountId: 'savings',
      });
      await expect(
        service.updateRecurring('u1', 'r1', { description: 'Gym (new)' }),
      ).rejects.toMatchObject({
        response: {
          errors: [
            { path: 'fromAccountId', message: 'Account Savings is archived' },
          ],
        },
      });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('400s when a transfer series would move money from and to the same account', async () => {
      const transfer = {
        ...root,
        type: TransactionType.TRANSFER,
        recurringFromAccountId: 'checking',
        recurringToAccountId: 'emergency',
      };
      const { service, prisma } = setup(transfer);
      await expect(
        service.updateRecurring('u1', 'r1', { toAccountId: 'checking' }),
      ).rejects.toMatchObject({
        response: {
          errors: [
            {
              path: 'toAccountId',
              message:
                'Choose a different account from the one it transfers from',
            },
          ],
        },
      });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('still 404s for an account that is not the user’s', async () => {
      const { service } = setup();
      await expect(
        service.updateRecurring('u1', 'r1', { fromAccountId: 'someone-elses' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('drops the stale reason when an edit fixes a series the cron paused, which stays paused', async () => {
      const { service, prisma } = setup(paused);
      await service.updateRecurring('u1', 'r1', { fromAccountId: 'checking' });
      const data = (
        prisma.transaction.update.mock.calls[0] as unknown as [
          { data: Record<string, unknown> },
        ]
      )[0].data;
      expect(data).toMatchObject({
        recurringFromAccountId: 'checking',
        recurringError: null,
      });
      expect(data).not.toHaveProperty('recurringStatus');
    });
  });

  describe('pauseRecurring', () => {
    it('pauses an active series without a reason and returns the root as the panel reads it', async () => {
      const { service, prisma } = setup();
      await service.pauseRecurring('u1', 'r1');
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'r1',
          userId: 'u1',
          deletedAt: null,
          recurringStatus: RecurringStatus.ACTIVE,
        },
        data: { recurringStatus: RecurringStatus.PAUSED, recurringError: null },
      });
      // getById re-reads with the full scalar set, recurringError and lastFailedAt included.
      expect(prisma.transaction.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: 'r1', userId: 'u1', deletedAt: null },
        }),
      );
    });

    it('400s for a series that is not active', async () => {
      const { service, prisma } = setup(paused);
      await expect(service.pauseRecurring('u1', 'r1')).rejects.toThrow(
        'Only an active recurring series can be paused',
      );
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('resumeRecurring', () => {
    beforeEach(() =>
      jest.useFakeTimers({ now: new Date('2026-10-25T12:00:00Z') }),
    );
    afterEach(() => jest.useRealTimers());

    it('400s with the reason while the series still cannot post, and stays paused showing it', async () => {
      const { service, prisma } = setup(paused);
      await expect(service.resumeRecurring('u1', 'r1')).rejects.toThrow(
        'Account Savings is archived',
      );
      // Only the reason is written: still paused, cursor untouched.
      expect(prisma.transaction.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'r1',
          userId: 'u1',
          deletedAt: null,
          recurringStatus: RecurringStatus.PAUSED,
        },
        data: { recurringError: 'Account Savings is archived' },
      });
    });

    it('clears the reason and picks up from the first occurrence on or after today, without backfilling', async () => {
      const { service, prisma } = setup({
        ...paused,
        recurringFromAccountId: 'checking',
      });
      await service.resumeRecurring('u1', 'r1');
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'r1',
          userId: 'u1',
          deletedAt: null,
          recurringStatus: RecurringStatus.PAUSED,
        },
        data: {
          recurringError: null,
          lastFailedAt: null,
          recurringStatus: RecurringStatus.ACTIVE,
          // Aug 15, Sep 15 and Oct 15 fell due while paused and are skipped.
          nextOccurrenceAt: new Date('2026-11-15T09:00:00Z'),
        },
      });
    });

    it('ends the series when skipping ahead lands past its end date', async () => {
      const { service, prisma } = setup({
        ...paused,
        recurringFromAccountId: 'checking',
        recurringEndDate: new Date('2026-10-31T00:00:00Z'),
      });
      await service.resumeRecurring('u1', 'r1');
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recurringStatus: RecurringStatus.CANCELLED,
            nextOccurrenceAt: null,
          }),
        }),
      );
    });

    it('400s for a series that is not paused', async () => {
      const { service } = setup();
      await expect(service.resumeRecurring('u1', 'r1')).rejects.toThrow(
        'Only a paused recurring series can be resumed',
      );
    });

    it('400s when a cancel won the race', async () => {
      const { service } = setup(
        { ...paused, recurringFromAccountId: 'checking' },
        0,
      );
      await expect(service.resumeRecurring('u1', 'r1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('findSeriesProblem', () => {
    const template = {
      type: TransactionType.EXPENSE,
      currency: 'USD',
      categoryId: null,
      recurringFromAccountId: 'checking',
      recurringToAccountId: null,
    };

    it('is null for a series that can post', async () => {
      const { service } = setup();
      await expect(
        service.findSeriesProblem('u1', template),
      ).resolves.toBeNull();
    });

    it('names an archived account', async () => {
      const { service } = setup();
      await expect(
        service.findSeriesProblem('u1', {
          ...template,
          recurringFromAccountId: 'savings',
        }),
      ).resolves.toBe('Account Savings is archived');
    });

    it('names an account in another currency', async () => {
      const { service } = setup();
      await expect(
        service.findSeriesProblem('u1', {
          ...template,
          recurringFromAccountId: 'dinar',
        }),
      ).resolves.toBe('Account Dinar is in TND, but the series is in USD');
    });

    it('catches a transfer from and to the same account, and a missing account', async () => {
      const { service } = setup();
      await expect(
        service.findSeriesProblem('u1', {
          ...template,
          type: TransactionType.TRANSFER,
          recurringToAccountId: 'checking',
        }),
      ).resolves.toBe('The series transfers from and to the same account');
      await expect(
        service.findSeriesProblem('u1', {
          ...template,
          recurringFromAccountId: 'gone',
        }),
      ).resolves.toBe('An account of this series no longer exists');
    });

    it('turns a category that no longer fits into a reason', async () => {
      const { service, categories } = setup();
      categories.assertAssignable.mockRejectedValueOnce(
        new NotFoundException('Category c1 not found'),
      );
      await expect(
        service.findSeriesProblem('u1', { ...template, categoryId: 'c1' }),
      ).resolves.toBe('The category of this series no longer exists');
    });
  });
});
