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
  it('advances by one month, keeping the anchor day', () => {
    const next = computeNextOccurrence(15, new Date(2026, 0, 15), RecurringInterval.MONTHLY);
    expect(next).toEqual(new Date(2026, 1, 15));
  });

  it('clamps to the last day of a shorter month', () => {
    const next = computeNextOccurrence(31, new Date(2026, 0, 31), RecurringInterval.MONTHLY);
    expect(next).toEqual(new Date(2026, 1, 28));
  });

  it('recovers the anchor day once the target month is long enough again', () => {
    const next = computeNextOccurrence(31, new Date(2026, 1, 28), RecurringInterval.MONTHLY);
    expect(next).toEqual(new Date(2026, 2, 31));
  });

  it('advances by one year for YEARLY, clamping Feb 29 in a non-leap year', () => {
    const next = computeNextOccurrence(29, new Date(2024, 1, 29), RecurringInterval.YEARLY);
    expect(next).toEqual(new Date(2025, 1, 28));
  });
});
