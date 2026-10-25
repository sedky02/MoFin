import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountsService } from '../accounts/accounts.service';
import { LedgerService } from './ledger.service';

type TestAccount = {
  id: string;
  currency: string;
  archivedAt?: Date | null;
  openingBalance?: string;
};

describe('LedgerService', () => {
  const account = (currency: string) => ({ id: `acc-${currency}`, currency });

  // The real AccountsService over an in-memory account table, so the
  // archived/active rules are the ones the app actually runs. Every test
  // account belongs to user u1.
  function makeService(
    accounts: Record<string, TestAccount>,
    groupedRows: unknown[] = [],
  ) {
    const findFirst = jest.fn(
      async ({
        where,
      }: {
        where: { id: string; userId: string; archivedAt?: null };
      }) => {
        const found = Object.values(accounts).find(
          (a) => a.id === where.id && where.userId === 'u1',
        );
        if (!found) return null;
        if ('archivedAt' in where && found.archivedAt) return null;
        return found;
      },
    );
    // Mirrors the opening-balance query's where-clause: non-zero, optional id/currency.
    const findMany = jest.fn(
      async ({
        where,
      }: {
        where: { userId: string; id?: string; currency?: string };
      }) =>
        Object.values(accounts)
          .filter(
            (a) =>
              where.userId === 'u1' &&
              !new Prisma.Decimal(a.openingBalance ?? 0).isZero(),
          )
          .filter(
            (a) =>
              (where.id ? a.id === where.id : true) &&
              (where.currency ? a.currency === where.currency : true),
          )
          .map((a) => ({
            id: a.id,
            currency: a.currency,
            openingBalance: new Prisma.Decimal(a.openingBalance!),
          })),
    );
    const prisma = {
      account: { findFirst, findMany },
      transactionItem: { groupBy: jest.fn(async () => groupedRows) },
    };
    return new LedgerService(
      prisma as never,
      new AccountsService(prisma as never),
    );
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
      expect(entries[0]).toMatchObject({
        accountId: 'acc-USD',
        direction: 'CREDIT',
        amount: '100',
      });
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
      const service = makeService({
        from: account('USD'),
        to: { id: 'acc-USD2', currency: 'USD' },
      });
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

    it('creates one DEBIT per split item for EXPENSE, each carrying its own categoryId', async () => {
      const service = makeService({ from: account('USD') });
      const entries = await service.buildEntriesForCommand('u1', {
        type: 'EXPENSE',
        amount: '50',
        currency: 'USD',
        fromAccountId: 'acc-USD',
        description: 'groceries run',
        items: [
          { amount: '30', categoryId: 'cat-groceries' },
          { amount: '20', categoryId: 'cat-household' },
        ],
      });
      expect(entries).toHaveLength(2);
      expect(entries).toEqual([
        expect.objectContaining({
          accountId: 'acc-USD',
          direction: 'DEBIT',
          amount: '30',
          categoryId: 'cat-groceries',
        }),
        expect.objectContaining({
          accountId: 'acc-USD',
          direction: 'DEBIT',
          amount: '20',
          categoryId: 'cat-household',
        }),
      ]);
    });

    it('creates one CREDIT per split item for INCOME', async () => {
      const service = makeService({ to: account('USD') });
      const entries = await service.buildEntriesForCommand('u1', {
        type: 'INCOME',
        amount: '100',
        currency: 'USD',
        toAccountId: 'acc-USD',
        description: 'paycheck',
        items: [
          { amount: '80', categoryId: 'cat-salary' },
          { amount: '20', categoryId: 'cat-bonus' },
        ],
      });
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.direction)).toEqual(['CREDIT', 'CREDIT']);
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

    it('rejects an expense from an archived account', async () => {
      const service = makeService({
        old: {
          id: 'acc-old',
          currency: 'EUR',
          archivedAt: new Date('2026-09-01'),
        },
      });
      await expect(
        service.buildEntriesForCommand('u1', {
          type: 'EXPENSE',
          amount: '20',
          currency: 'EUR',
          fromAccountId: 'acc-old',
          description: 'coffee',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a transfer into an archived account', async () => {
      const service = makeService({
        from: account('EUR'),
        old: {
          id: 'acc-old',
          currency: 'EUR',
          archivedAt: new Date('2026-09-01'),
        },
      });
      await expect(
        service.buildEntriesForCommand('u1', {
          type: 'TRANSFER',
          amount: '50',
          currency: 'EUR',
          fromAccountId: 'acc-EUR',
          toAccountId: 'acc-old',
          description: 'move',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a cross-currency transfer (audit A3)', async () => {
      const service = makeService({
        from: account('USD'),
        to: { id: 'acc-EUR', currency: 'EUR' },
      });
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
    it("leaves deleted transactions' lines out of the sum", async () => {
      const groupBy = jest.fn(async () => []);
      const prisma = {
        account: {
          findFirst: jest.fn(async () => ({ id: 'a', currency: 'USD' })),
          findMany: jest.fn(async () => []),
        },
        transactionItem: { groupBy },
      };
      const service = new LedgerService(
        prisma as never,
        new AccountsService(prisma as never),
      );
      await service.getBalance('u1', { accountId: 'a' });
      expect(groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            transaction: { deletedAt: null },
          }),
        }),
      );
    });

    it('adds CREDITs and subtracts DEBITs from grouped DB rows', async () => {
      const rows = [
        {
          accountId: 'a',
          currency: 'USD',
          direction: 'CREDIT',
          _sum: { amount: new Prisma.Decimal('100') },
        },
        {
          accountId: 'a',
          currency: 'USD',
          direction: 'DEBIT',
          _sum: { amount: new Prisma.Decimal('30') },
        },
      ];
      const service = makeService({ a: { id: 'a', currency: 'USD' } }, rows);
      const result = await service.getBalance('u1', { accountId: 'a' });
      expect(result).toEqual([{ key: 'USD', balance: '70' }]);
    });

    it('keys by accountId:currency when no single account is requested', async () => {
      const rows = [
        {
          accountId: 'a',
          currency: 'USD',
          direction: 'CREDIT',
          _sum: { amount: new Prisma.Decimal('50') },
        },
        {
          accountId: 'b',
          currency: 'EUR',
          direction: 'DEBIT',
          _sum: { amount: new Prisma.Decimal('10') },
        },
      ];
      const service = makeService({}, rows);
      const result = await service.getBalance('u1', {});
      expect(result).toEqual(
        expect.arrayContaining([
          { key: 'a:USD', balance: '50' },
          { key: 'b:EUR', balance: '-10' },
        ]),
      );
    });

    it('returns the real balance of an archived account', async () => {
      const rows = [
        {
          accountId: 'acc-old',
          currency: 'EUR',
          direction: 'CREDIT',
          _sum: { amount: new Prisma.Decimal('800.00') },
        },
      ];
      const service = makeService(
        {
          old: {
            id: 'acc-old',
            currency: 'EUR',
            archivedAt: new Date('2026-09-01'),
          },
        },
        rows,
      );
      const result = await service.getBalance('u1', { accountId: 'acc-old' });
      expect(result).toEqual([{ key: 'EUR', balance: '800' }]);
    });

    it("404s for an account that isn't the user's", async () => {
      const service = makeService({ a: { id: 'a', currency: 'USD' } });
      await expect(
        service.getBalance('someone-else', { accountId: 'a' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('starts an account from its opening balance', async () => {
      const rows = [
        {
          accountId: 'a',
          currency: 'USD',
          direction: 'DEBIT',
          _sum: { amount: new Prisma.Decimal('200') },
        },
      ];
      const service = makeService(
        { a: { id: 'a', currency: 'USD', openingBalance: '5000' } },
        rows,
      );
      await expect(
        service.getBalance('u1', { accountId: 'a' }),
      ).resolves.toEqual([{ key: 'USD', balance: '4800' }]);
    });

    it('shows an opening balance for an account with no entries yet', async () => {
      const service = makeService({
        a: { id: 'a', currency: 'USD', openingBalance: '5000' },
      });
      await expect(
        service.getBalance('u1', { accountId: 'a' }),
      ).resolves.toEqual([{ key: 'USD', balance: '5000' }]);
    });

    it('keeps a negative opening balance (a credit account) negative', async () => {
      const service = makeService({
        card: { id: 'card', currency: 'TND', openingBalance: '-1250.500' },
      });
      await expect(
        service.getBalance('u1', { accountId: 'card' }),
      ).resolves.toEqual([{ key: 'TND', balance: '-1250.5' }]);
    });

    it("adds each opening balance to its own account's currency only", async () => {
      const rows = [
        {
          accountId: 'a',
          currency: 'USD',
          direction: 'CREDIT',
          _sum: { amount: new Prisma.Decimal('50') },
        },
        {
          accountId: 'b',
          currency: 'EUR',
          direction: 'DEBIT',
          _sum: { amount: new Prisma.Decimal('10') },
        },
      ];
      const service = makeService(
        {
          a: { id: 'a', currency: 'USD', openingBalance: '1000' },
          b: { id: 'b', currency: 'EUR', openingBalance: '300' },
          old: {
            id: 'old',
            currency: 'EUR',
            archivedAt: new Date('2026-09-01'),
            openingBalance: '25',
          },
        },
        rows,
      );
      const all = await service.getBalance('u1', {});
      expect(all).toHaveLength(3);
      expect(all).toEqual(
        expect.arrayContaining([
          { key: 'a:USD', balance: '1050' },
          { key: 'b:EUR', balance: '290' },
          // Archived accounts still hold their opening balance.
          { key: 'old:EUR', balance: '25' },
        ]),
      );
    });

    it('asks only for opening balances in the requested currency', async () => {
      const service = makeService({
        a: { id: 'a', currency: 'USD', openingBalance: '1000' },
        b: { id: 'b', currency: 'EUR', openingBalance: '300' },
      });
      await expect(
        service.getBalance('u1', { currency: 'EUR' }),
      ).resolves.toEqual([{ key: 'b:EUR', balance: '300' }]);
    });

    it('treats a group with no matching rows (null _sum) as zero', async () => {
      const rows = [
        {
          accountId: 'a',
          currency: 'USD',
          direction: 'CREDIT',
          _sum: { amount: null },
        },
      ];
      const service = makeService({ a: { id: 'a', currency: 'USD' } }, rows);
      const result = await service.getBalance('u1', { accountId: 'a' });
      expect(result).toEqual([{ key: 'USD', balance: '0' }]);
    });
  });
});
