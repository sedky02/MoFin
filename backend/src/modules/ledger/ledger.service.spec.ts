import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LedgerService } from './ledger.service';

describe('LedgerService', () => {
  const account = (currency: string) => ({ id: `acc-${currency}`, currency });

  function makeService(accounts: Record<string, { id: string; currency: string }>, items: unknown[] = []) {
    const accountsService = {
      assertOwned: jest.fn(async (_userId: string, id: string) => {
        const found = Object.values(accounts).find((a) => a.id === id);
        if (!found) throw new Error('not owned');
        return found;
      }),
    };
    const prisma = {
      transactionItem: { findMany: jest.fn(async () => items) },
    };
    return new LedgerService(prisma as never, accountsService as never);
  }

  describe('buildEntriesForCommand', () => {
    it('creates a single CREDIT for INCOME', async () => {
      const service = makeService({ to: account('USD') });
      const entries = await service.buildEntriesForCommand('u1', {
        type: 'INCOME',
        amount: '100',
        currency: 'USD',
        toAccountId: 'acc-USD',
        description: 'salary',
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ accountId: 'acc-USD', direction: 'CREDIT', amount: '100' });
    });

    it('creates a single DEBIT for EXPENSE', async () => {
      const service = makeService({ from: account('USD') });
      const entries = await service.buildEntriesForCommand('u1', {
        type: 'EXPENSE',
        amount: '20',
        currency: 'USD',
        fromAccountId: 'acc-USD',
        description: 'coffee',
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ direction: 'DEBIT', amount: '20' });
    });

    it('creates a balanced DEBIT + CREDIT pair for TRANSFER', async () => {
      const service = makeService({ from: account('USD'), to: { id: 'acc-USD2', currency: 'USD' } });
      const entries = await service.buildEntriesForCommand('u1', {
        type: 'TRANSFER',
        amount: '50',
        currency: 'USD',
        fromAccountId: 'acc-USD',
        toAccountId: 'acc-USD2',
        description: 'move',
      });
      expect(entries.map((e) => e.direction)).toEqual(['DEBIT', 'CREDIT']);
    });

    it('rejects a transaction whose currency differs from the account currency (audit A3)', async () => {
      const service = makeService({ from: account('USD') });
      await expect(
        service.buildEntriesForCommand('u1', {
          type: 'EXPENSE',
          amount: '20',
          currency: 'EUR',
          fromAccountId: 'acc-USD',
          description: 'mismatch',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a cross-currency transfer (audit A3)', async () => {
      const service = makeService({ from: account('USD'), to: { id: 'acc-EUR', currency: 'EUR' } });
      await expect(
        service.buildEntriesForCommand('u1', {
          type: 'TRANSFER',
          amount: '50',
          currency: 'USD',
          fromAccountId: 'acc-USD',
          toAccountId: 'acc-EUR',
          description: 'cross',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getBalance', () => {
    it('adds CREDITs and subtracts DEBITs', async () => {
      const items = [
        { accountId: 'a', currency: 'USD', direction: 'CREDIT', amount: new Prisma.Decimal('100') },
        { accountId: 'a', currency: 'USD', direction: 'DEBIT', amount: new Prisma.Decimal('30') },
      ];
      const service = makeService({ a: { id: 'a', currency: 'USD' } }, items);
      const result = await service.getBalance('u1', { accountId: 'a' });
      expect(result).toEqual([{ key: 'USD', balance: '70' }]);
    });
  });
});
