import { RecurringInterval, RecurringStatus, TransactionType } from '@prisma/client';
import { RecurringTransactionsCron } from './recurring-transactions.cron';

describe('RecurringTransactionsCron', () => {
  const fakeDb = { transaction: { update: jest.fn() } };
  const root = {
    id: 'root-1',
    userId: 'user-1',
    type: TransactionType.EXPENSE,
    description: 'Rent',
    currency: 'USD',
    categoryId: null,
    occurredAt: new Date('2026-01-31T00:00:00Z'),
    nextOccurrenceAt: new Date('2026-02-28T00:00:00Z'),
    recurringAmount: { toString: () => '1000' },
    recurringInterval: RecurringInterval.MONTHLY,
    recurringEndDate: null,
    recurringFromAccountId: 'acc-1',
    recurringToAccountId: null
  };

  function makeCron({ locked = true } = {}) {
    const prisma = {
      transaction: { findMany: jest.fn().mockResolvedValue([root]) },
      $transaction: jest.fn(async (fn: (db: unknown) => unknown) => fn(fakeDb)),
      $queryRaw: jest.fn().mockResolvedValue([{ locked }])
    };
    const transactionsService = {
      create: jest.fn().mockResolvedValue({ id: 'occ-1', occurredAt: root.nextOccurrenceAt })
    };
    const events = { emit: jest.fn() };
    const cron = new RecurringTransactionsCron(prisma as never, transactionsService as never, events as never);
    return { cron, prisma, transactionsService, events };
  }

  afterEach(() => jest.clearAllMocks());

  it('creates the occurrence and advances the cursor inside the same DB transaction', async () => {
    const { cron, prisma, transactionsService } = makeCron();
    await cron.generateDueOccurrences();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The create call must receive the transaction's db client as its 3rd arg,
    // so it participates in the same commit as the cursor update below.
    expect(transactionsService.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ parentTransactionId: 'root-1' }), fakeDb);
    expect(fakeDb.transaction.update).toHaveBeenCalledWith({
      where: { id: 'root-1' },
      data: { nextOccurrenceAt: new Date('2026-03-31T00:00:00Z') }
    });
  });

  it('emits TransactionCreated only after the transaction commits', async () => {
    const { cron, events } = makeCron();
    await cron.generateDueOccurrences();

    expect(events.emit).toHaveBeenCalledWith(
      'transaction.created',
      expect.objectContaining({ transactionId: 'occ-1', userId: 'user-1' })
    );
  });

  it('skips the run entirely when another instance holds the advisory lock', async () => {
    const { cron, prisma, transactionsService } = makeCron({ locked: false });
    await cron.generateDueOccurrences();

    expect(transactionsService.create).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it('releases the advisory lock even if generation throws', async () => {
    const { cron, prisma, transactionsService } = makeCron();
    transactionsService.create.mockRejectedValue(new Error('boom'));

    await cron.generateDueOccurrences();

    // pg_try_advisory_lock then pg_advisory_unlock: two raw calls total.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
