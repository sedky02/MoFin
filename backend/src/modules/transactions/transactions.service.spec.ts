import { BadRequestException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { CreateTransactionCommand } from './dto/transactions.dto';

describe('TransactionsService.validateCommand', () => {
  // The cross-field rules run synchronously before any dependency is touched,
  // so bare stubs are enough to exercise them.
  const service = new TransactionsService({} as never, {} as never, {} as never, {} as never);

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
});
