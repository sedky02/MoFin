import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  RecurringInterval,
  RecurringStatus,
  TransactionType,
} from '@prisma/client';
import { RecurringSeriesService } from './recurring-series.service';
import { TransactionsService } from './transactions.service';

describe('RecurringSeriesService', () => {
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
    const service = new RecurringSeriesService(
      prisma as never,
      new TransactionsService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
      ),

      categories as never,

      accountsService as never,
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

  describe('cancelRecurring', () => {
    it('cancels conditionally, so a series the cron already ended is not rewritten', async () => {
      const { service, prisma } = setup();
      await service.cancelRecurring('u1', 'r1');
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'r1',
          userId: 'u1',
          deletedAt: null,
          recurringStatus: { not: RecurringStatus.CANCELLED },
        },
        data: { recurringStatus: RecurringStatus.CANCELLED },
      });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
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
