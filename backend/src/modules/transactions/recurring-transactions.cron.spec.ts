import { BadRequestException } from '@nestjs/common';
import {
  RecurringInterval,
  RecurringStatus,
  TransactionType,
} from '@prisma/client';
import { RecurringTransactionsCron } from './recurring-transactions.cron';

describe('RecurringTransactionsCron', () => {
  const fakeDb = {
    transaction: { update: jest.fn() },
    $queryRaw: jest.fn(),
  };
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
    recurringEndDate: null as Date | null,
    recurringFromAccountId: 'acc-1',
    recurringToAccountId: null,
  };

  function makeCron({
    locked = true,
    due = root,
  }: { locked?: boolean; due?: typeof root } = {}) {
    const prisma = {
      transaction: {
        findMany: jest.fn().mockResolvedValue([due]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (fn: (db: unknown) => unknown) => fn(fakeDb)),
    };
    fakeDb.$queryRaw.mockResolvedValue([{ locked }]);
    const transactionsService = {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'occ-1', occurredAt: root.nextOccurrenceAt }),
      announceCreated: jest.fn(),
    };
    const seriesService = {
      findSeriesProblem: jest.fn().mockResolvedValue(null),
    };
    const cron = new RecurringTransactionsCron(
      prisma as never,
      transactionsService as never,
      seriesService as never,
    );
    return { cron, prisma, transactionsService, seriesService };
  }

  afterEach(() => jest.clearAllMocks());

  it('skips deleted roots: deleting the root stops its series', async () => {
    const { cron, prisma } = makeCron();
    await cron.generateDueOccurrences();
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isRecurring: true,
        recurringStatus: RecurringStatus.ACTIVE,
        deletedAt: null,
      }),
    });
  });

  it('creates the occurrence and advances the cursor inside the same DB transaction', async () => {
    const { cron, prisma, transactionsService } = makeCron();
    await cron.generateDueOccurrences();

    // One transaction holds the run's advisory lock, one posts the occurrence.
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    // The create call must receive the transaction's db client as its 3rd arg,
    // so it participates in the same commit as the cursor update below.
    expect(transactionsService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ parentTransactionId: 'root-1' }),
      fakeDb,
    );
    expect(fakeDb.transaction.update).toHaveBeenCalledWith({
      where: { id: 'root-1' },
      data: { nextOccurrenceAt: new Date('2026-03-31T00:00:00Z') },
    });
  });

  it('ends a series whose next occurrence is already past its end date, posting nothing', async () => {
    // Created Oct 17 with end Oct 30: the Nov 17 charge was excluded by the user.
    const pastEnd = {
      ...root,
      occurredAt: new Date('2026-10-17T00:00:00Z'),
      nextOccurrenceAt: new Date('2026-11-17T00:00:00Z'),
      recurringEndDate: new Date('2026-10-30T00:00:00Z'),
    };
    const { cron, prisma, transactionsService } = makeCron({
      due: pastEnd,
    });
    await cron.generateDueOccurrences();

    expect(transactionsService.create).not.toHaveBeenCalled();
    // Only the lock transaction ran; no occurrence transaction.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionsService.announceCreated).not.toHaveBeenCalled();
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'root-1' },
      data: {
        recurringStatus: RecurringStatus.CANCELLED,
        nextOccurrenceAt: null,
      },
    });
  });

  it('posts the occurrence that lands exactly on the end date, then ends the series', async () => {
    const lastOne = {
      ...root,
      recurringEndDate: new Date('2026-02-28T00:00:00Z'),
    };
    const { cron, transactionsService } = makeCron({ due: lastOne });
    await cron.generateDueOccurrences();

    expect(transactionsService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        occurredAt: new Date('2026-02-28T00:00:00Z'),
        parentTransactionId: 'root-1',
      }),
      fakeDb,
    );
    expect(fakeDb.transaction.update).toHaveBeenCalledWith({
      where: { id: 'root-1' },
      data: {
        recurringStatus: RecurringStatus.CANCELLED,
        nextOccurrenceAt: null,
      },
    });
    expect(transactionsService.announceCreated).toHaveBeenCalledTimes(1);
  });

  it('announces the occurrence only after the transaction commits', async () => {
    const { cron, transactionsService } = makeCron();
    await cron.generateDueOccurrences();

    expect(transactionsService.announceCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'occ-1' }),
    );
  });

  it('skips the run entirely when another instance holds the advisory lock', async () => {
    const { cron, prisma, transactionsService } = makeCron({ locked: false });
    await cron.generateDueOccurrences();

    expect(transactionsService.create).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it('takes a transaction-level advisory lock, so Postgres releases it with the run', async () => {
    const { cron, transactionsService } = makeCron();
    transactionsService.create.mockRejectedValue(new Error('boom'));

    await cron.generateDueOccurrences();

    // A single xact lock call and no explicit unlock to leak on another pooled connection.
    expect(fakeDb.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String(fakeDb.$queryRaw.mock.calls[0][0])).toContain(
      'pg_try_advisory_xact_lock',
    );
  });

  describe('a series that can no longer post', () => {
    beforeEach(() =>
      jest.useFakeTimers({ now: new Date('2026-10-25T00:00:05Z') }),
    );
    afterEach(() => jest.useRealTimers());

    const pausedWith = (reason: string) => ({
      where: { id: 'root-1', recurringStatus: RecurringStatus.ACTIVE },
      data: {
        recurringStatus: RecurringStatus.PAUSED,
        recurringError: reason,
        lastFailedAt: new Date('2026-10-25T00:00:05Z'),
      },
    });

    it('is paused with the reason instead of failing every night, posting nothing', async () => {
      const { cron, prisma, transactionsService, seriesService } = makeCron();
      seriesService.findSeriesProblem.mockResolvedValue(
        'Account Savings is archived',
      );

      await cron.generateDueOccurrences();

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
        pausedWith('Account Savings is archived'),
      );
      expect(transactionsService.create).not.toHaveBeenCalled();
      expect(transactionsService.announceCreated).not.toHaveBeenCalled();
    });

    it('is paused when create rejects the occurrence', async () => {
      const { cron, prisma, transactionsService } = makeCron();
      transactionsService.create.mockRejectedValue(
        new BadRequestException('Transfers cannot have a category'),
      );

      await cron.generateDueOccurrences();

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
        pausedWith('Transfers cannot have a category'),
      );
    });

    it('is only fetched while active, so a paused series is not retried', async () => {
      const { cron, prisma } = makeCron();
      await cron.generateDueOccurrences();
      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          recurringStatus: RecurringStatus.ACTIVE,
        }),
      });
    });
  });

  it('keeps a series active through an unexpected error, to retry on the next run', async () => {
    const { cron, prisma, transactionsService } = makeCron();
    transactionsService.create.mockRejectedValue(
      new Error('Connection terminated unexpectedly'),
    );

    await cron.generateDueOccurrences();

    expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('moves on to the next series after pausing one', async () => {
    const other = { ...root, id: 'root-2' };
    const { cron, prisma, transactionsService, seriesService } = makeCron();
    prisma.transaction.findMany.mockResolvedValue([root, other]);
    seriesService.findSeriesProblem
      .mockResolvedValueOnce('Account Savings is archived')
      .mockResolvedValueOnce(null);

    await cron.generateDueOccurrences();

    expect(transactionsService.create).toHaveBeenCalledTimes(1);
    expect(transactionsService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ parentTransactionId: 'root-2' }),
      fakeDb,
    );
  });
});
