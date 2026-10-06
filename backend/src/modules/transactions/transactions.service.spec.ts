import { BadRequestException } from '@nestjs/common';
import { RecurringInterval, TransactionType } from '@prisma/client';
import { computeNextOccurrence, TransactionsService } from './transactions.service';
import { CreateTransactionCommand } from './dto/transactions.dto';

describe('TransactionsService.validateCommand', () => {
  // The cross-field rules run synchronously before any dependency is touched,
  // so bare stubs are enough to exercise them.
  const service = new TransactionsService({} as never, {} as never, {} as never, {} as never, {} as never);

  const base: CreateTransactionCommand = {
    type: TransactionType.EXPENSE,
    description: 'x',
    amount: '10',
    currency: 'USD',
    occurredAt: new Date(),
    fromAccountId: 'a',
  };

  const expectReject = (command: CreateTransactionCommand) =>
    expect(service.create('u1', command)).rejects.toBeInstanceOf(BadRequestException);

  it('rejects non-positive amounts', () => expectReject({ ...base, amount: '0' }));

  it('rejects INCOME without toAccountId', () =>
    expectReject({ ...base, type: TransactionType.INCOME, fromAccountId: undefined }));

  it('rejects EXPENSE without fromAccountId', () =>
    expectReject({ ...base, type: TransactionType.EXPENSE, fromAccountId: undefined }));

  it('rejects TRANSFER missing an account', () =>
    expectReject({ ...base, type: TransactionType.TRANSFER, toAccountId: undefined }));

  it('rejects TRANSFER between identical accounts', () =>
    expectReject({ ...base, type: TransactionType.TRANSFER, fromAccountId: 'a', toAccountId: 'a' }));

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
    expectReject({ ...base, amount: '10', items: [{ amount: '4' }, { amount: '5' }] }));

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

describe('computeNextOccurrence', () => {
  // UTC throughout (audit DATA-XX): a local-time constructor here would pass
  // or fail depending on the machine's TZ, exactly the bug being fixed. Every
  // date below is built with Date.UTC and every anchorDay comes from
  // getUTCDate(), mirroring the real callers.
  it('advances by one month, keeping the anchor day', () => {
    const next = computeNextOccurrence(15, new Date(Date.UTC(2026, 0, 15)), RecurringInterval.MONTHLY);
    expect(next).toEqual(new Date(Date.UTC(2026, 1, 15)));
  });

  it('clamps to the last day of a shorter month', () => {
    const next = computeNextOccurrence(31, new Date(Date.UTC(2026, 0, 31)), RecurringInterval.MONTHLY);
    expect(next).toEqual(new Date(Date.UTC(2026, 1, 28)));
  });

  it('recovers the anchor day once the target month is long enough again', () => {
    const next = computeNextOccurrence(31, new Date(Date.UTC(2026, 1, 28)), RecurringInterval.MONTHLY);
    expect(next).toEqual(new Date(Date.UTC(2026, 2, 31)));
  });

  it('advances by one year for YEARLY, clamping Feb 29 in a non-leap year', () => {
    const next = computeNextOccurrence(29, new Date(Date.UTC(2024, 1, 29)), RecurringInterval.YEARLY);
    expect(next).toEqual(new Date(Date.UTC(2025, 1, 28)));
  });

  it('is unaffected by the server TZ at a month boundary (23:30 on the 31st stays the 31st)', () => {
    // A transaction entered at 23:30 UTC on Jan 31st must still anchor to the
    // 31st and land on Feb 28th — not silently roll to Feb 1st because the
    // server happens to run in a timezone ahead of UTC.
    const lateOnThe31st = new Date(Date.UTC(2026, 0, 31, 23, 30));
    const next = computeNextOccurrence(lateOnThe31st.getUTCDate(), lateOnThe31st, RecurringInterval.MONTHLY);
    expect(next).toEqual(new Date(Date.UTC(2026, 1, 28, 23, 30)));
  });
});

describe('TransactionsService.voidTransaction', () => {
  const original = {
    id: 't1',
    userId: 'u1',
    type: TransactionType.EXPENSE,
    description: 'Groceries',
    currency: 'USD',
    categoryId: 'c1',
    occurredAt: new Date('2026-03-10T10:00:00Z'),
    voidedAt: null,
    reversesTransactionId: null,
    items: [
      { accountId: 'a1', categoryId: 'c1', direction: 'DEBIT', amount: '40', currency: 'USD', memo: null },
      { accountId: 'a2', categoryId: null, direction: 'CREDIT', amount: '40', currency: 'USD', memo: 'm' },
    ],
  };

  function setup(overrides: { found?: unknown; claimed?: number } = {}) {
    const tx = {
      transaction: {
        updateMany: jest.fn(async () => ({ count: overrides.claimed ?? 1 })),
        create: jest.fn(async () => ({ id: 'rev1' })),
        findUniqueOrThrow: jest.fn(async () => ({ id: 'rev1', occurredAt: new Date('2026-04-01T00:00:00Z'), items: [] })),
      },
      transactionItem: { createMany: jest.fn(async () => ({ count: 2 })) },
    };
    const prisma = {
      transaction: { findFirst: jest.fn(async () => ('found' in overrides ? overrides.found : original)) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const events = { emit: jest.fn() };
    const service = new TransactionsService(prisma as never, {} as never, {} as never, {} as never, events as never);
    return { service, tx, prisma, events };
  }

  it('stamps the original and appends a mirror with every direction flipped, same accounts and amounts', async () => {
    const { service, tx } = setup();
    await service.voidTransaction('u1', 't1');

    expect(tx.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', userId: 'u1', voidedAt: null },
      data: { voidedAt: expect.any(Date) },
    });
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reversesTransactionId: 't1', type: 'EXPENSE', currency: 'USD', description: 'Reversal: Groceries' }),
    });
    const created = (tx.transactionItem.createMany.mock.calls[0] as unknown as [{ data: Array<Record<string, unknown>> }])[0].data;
    expect(created.map((i) => [i.accountId, i.direction, String(i.amount)])).toEqual([
      ['a1', 'CREDIT', '40'],
      ['a2', 'DEBIT', '40'],
    ]);
    expect(created.every((i) => i.transactionId === 'rev1')).toBe(true);
  });

  it('invalidates cached summaries for both the original month and the reversal month', async () => {
    const { service, events } = setup();
    await service.voidTransaction('u1', 't1');
    const months = events.emit.mock.calls.map((c) => (c[1] as { occurredAt: Date }).occurredAt.toISOString());
    expect(months).toEqual(['2026-03-10T10:00:00.000Z', '2026-04-01T00:00:00.000Z']);
  });

  it('404s for an unknown or foreign transaction', async () => {
    const { service } = setup({ found: null });
    await expect(service.voidTransaction('u1', 'nope')).rejects.toThrow('not found');
  });

  it('refuses to void a reversal', async () => {
    const { service, tx } = setup({ found: { ...original, reversesTransactionId: 'x' } });
    await expect(service.voidTransaction('u1', 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('refuses a second void, including when it loses the race to claim the original', async () => {
    const already = setup({ found: { ...original, voidedAt: new Date() } });
    await expect(already.service.voidTransaction('u1', 't1')).rejects.toThrow('already voided');

    const raced = setup({ claimed: 0 });
    await expect(raced.service.voidTransaction('u1', 't1')).rejects.toThrow('already voided');
    expect(raced.tx.transaction.create).not.toHaveBeenCalled();
  });
});
