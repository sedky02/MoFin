import { accountScope } from '../account-access/account-access';
import { fakeAccess } from '../../../test/support/fake-account-access';
import { NotFoundException } from '@nestjs/common';
import { ThrottlerRequest } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { csvCell, csvText, toCsv, UTF8_BOM } from './export.csv';
import {
  EXPORT_THROTTLE,
  ExportThrottlerGuard,
  exportTracker,
} from './export-throttler.guard';
import { CSV_HEADER, ExportService, money } from './export.service';

const D = (v: string) => new Prisma.Decimal(v);
const NOW = new Date('2026-10-25T08:30:00Z');

function makeService(
  rows: { transactions?: unknown[]; goals?: unknown[]; user?: unknown } = {},
) {
  const prisma = {
    user: {
      findUnique: jest.fn(async () =>
        'user' in rows
          ? rows.user
          : { email: 'a@example.com', displayName: 'Amel' },
      ),
    },
    account: {
      findMany: jest.fn(async () => [
        {
          id: 'acc-1',
          name: 'Wallet',
          type: 'CASH',
          currency: 'TND',
          openingBalance: D('250.5'),
          archivedAt: null,
          createdAt: NOW,
          members: [],
        },
      ]),
    },
    category: { findMany: jest.fn(async () => []) },
    transaction: { findMany: jest.fn(async () => rows.transactions ?? []) },
    goal: { findMany: jest.fn(async () => rows.goals ?? []) },
  };
  return {
    service: new ExportService(prisma as never, fakeAccess() as never),
    prisma,
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    userId: 'user-1',
    type: 'EXPENSE',
    description: 'Groceries',
    currency: 'TND',
    occurredAt: new Date('2026-10-20T09:00:00Z'),
    categoryId: 'cat-1',
    category: { name: 'Food' },
    isRecurring: false,
    recurringInterval: null,
    recurringStatus: null,
    recurringEndDate: null,
    nextOccurrenceAt: null,
    recurringAmount: null,
    recurringFromAccountId: null,
    recurringToAccountId: null,
    parentTransactionId: null,
    deletedAt: null,
    draftId: null,
    createdAt: NOW,
    items: [
      {
        id: 'item-1',
        userId: 'user-1',
        transactionId: 'tx-1',
        accountId: 'acc-1',
        account: { name: 'Wallet' },
        categoryId: null,
        category: null,
        direction: 'DEBIT',
        amount: D('12.345'),
        currency: 'TND',
        memo: null,
      },
    ],
    ...overrides,
  };
}

describe('money', () => {
  it.each([
    ['12.345', '12.345'],
    ['12.3450', '12.345'],
    ['0.0001', '0.0001'],
    ['99999999999999.9999', '99999999999999.9999'],
    ['1000000', '1000000'],
  ])(
    'writes %s as %s, never through Number or exponent notation',
    (input, out) => {
      expect(money(D(input))).toBe(out);
    },
  );
});

describe('CSV writing', () => {
  it('leaves plain cells alone', () => {
    expect(csvCell('Groceries')).toBe('Groceries');
  });

  it('quotes a cell with a comma, a quote and a newline, doubling the quote', () => {
    expect(csvCell('Dinner, "Chez Ali"\nsplit 3 ways')).toBe(
      '"Dinner, ""Chez Ali""\nsplit 3 ways"',
    );
  });

  it('quotes a cell with a carriage return', () => {
    expect(csvCell('a\rb')).toBe('"a\rb"');
  });

  it.each(['=SUM(A1:A9)', '+1', '-1', '@cmd', '\tx'])(
    'defuses %j as a formula',
    (value) => {
      expect(csvText(value)).toBe(`'${value}`);
    },
  );

  it('keeps ordinary text, accents included', () => {
    expect(csvText('Café crème')).toBe('Café crème');
  });

  it('starts with a UTF-8 BOM and ends rows with CRLF', () => {
    expect(toCsv(['A', 'B'], [['1', '2']])).toBe(`${UTF8_BOM}A,B\r\n1,2\r\n`);
  });
});

describe('ExportService', () => {
  describe('JSON', () => {
    it('keeps 12.345 TND exact, and every Decimal as a string', async () => {
      const { service } = makeService({
        transactions: [
          transaction({
            isRecurring: true,
            recurringInterval: 'MONTHLY',
            recurringAmount: D('12.3450'),
          }),
        ],
        goals: [
          {
            id: 'goal-1',
            userId: 'user-1',
            accountId: 'acc-1',
            name: 'Save',
            type: 'BALANCE',
            targetAmount: D('1500.125'),
            isRecurring: false,
            recurrenceUnit: null,
            periodStart: new Date('2026-01-01T00:00:00Z'),
            periodEnd: new Date('2026-12-31T23:59:59.999Z'),
            archivedAt: null,
            createdAt: NOW,
            instances: [
              {
                id: 'gi-1',
                goalId: 'goal-1',
                periodStart: new Date('2026-01-01T00:00:00Z'),
                periodEnd: new Date('2026-12-31T23:59:59.999Z'),
                targetAmount: D('1500.125'),
                progressAmount: D('0.001'),
                status: 'IN_PROGRESS',
                computedAt: NOW,
              },
            ],
          },
        ],
      });
      const file = await service.export('user-1', 'json', NOW);
      const doc = JSON.parse(file.body);

      expect(doc.transactions[0].items[0].amount).toBe('12.345');
      expect(doc.transactions[0].recurringAmount).toBe('12.345');
      expect(doc.goals[0].targetAmount).toBe('1500.125');
      expect(doc.goals[0].instances[0]).toEqual(
        expect.objectContaining({
          targetAmount: '1500.125',
          progressAmount: '0.001',
        }),
      );
    });

    it('writes dates as ISO strings and leaves out internal fields', async () => {
      const { service } = makeService({ transactions: [transaction()] });
      const doc = JSON.parse(
        (await service.export('user-1', 'json', NOW)).body,
      );

      expect(doc.exportedAt).toBe('2026-10-25T08:30:00.000Z');
      expect(doc.user).toEqual({ email: 'a@example.com', displayName: 'Amel' });
      expect(doc.accounts[0]).toEqual({
        id: 'acc-1',
        name: 'Wallet',
        type: 'CASH',
        currency: 'TND',
        role: 'OWNER',
        openingBalance: '250.5',
        archivedAt: null,
        createdAt: NOW.toISOString(),
      });
      const [tx] = doc.transactions;
      expect(tx.occurredAt).toBe('2026-10-20T09:00:00.000Z');
      expect(tx).not.toHaveProperty('userId');
      expect(tx).not.toHaveProperty('deletedAt');
      expect(tx).not.toHaveProperty('draftId');
      expect(tx.items[0]).not.toHaveProperty('userId');
      expect(tx.items[0]).not.toHaveProperty('transactionId');
      expect(tx.items[0]).toEqual(
        expect.objectContaining({
          accountId: 'acc-1',
          accountName: 'Wallet',
          direction: 'DEBIT',
          currency: 'TND',
        }),
      );
    });

    it('names the file after the export day', async () => {
      const { service } = makeService();
      const file = await service.export('user-1', 'json', NOW);
      expect(file.filename).toBe('mofin-export-2026-10-25.json');
      expect(file.contentType).toMatch(/^application\/json/);
    });
  });

  describe('CSV', () => {
    it('writes one row per line with the exact, signed amount', async () => {
      const { service } = makeService({
        transactions: [
          transaction(),
          transaction({
            id: 'tx-2',
            type: 'TRANSFER',
            description: 'To savings',
            category: null,
            categoryId: null,
            items: [
              {
                ...transaction().items[0],
                id: 'i-out',
                direction: 'DEBIT',
                amount: D('100.500'),
                account: { name: 'Wallet' },
              },
              {
                ...transaction().items[0],
                id: 'i-in',
                direction: 'CREDIT',
                amount: D('100.500'),
                account: { name: 'Savings' },
              },
            ],
          }),
        ],
      });
      const file = await service.export('user-1', 'csv', NOW);

      expect(file.filename).toBe('mofin-export-2026-10-25.csv');
      expect(file.contentType).toBe('text/csv; charset=utf-8');
      expect(file.body.startsWith(UTF8_BOM)).toBe(true);
      const lines = file.body.slice(1).trimEnd().split('\r\n');
      expect(lines).toEqual([
        CSV_HEADER.join(','),
        '2026-10-20T09:00:00.000Z,Groceries,EXPENSE,Wallet,Food,-12.345,TND,tx-1',
        '2026-10-20T09:00:00.000Z,To savings,TRANSFER,Wallet,,-100.5,TND,tx-2',
        '2026-10-20T09:00:00.000Z,To savings,TRANSFER,Savings,,100.5,TND,tx-2',
      ]);
    });

    it("prefers a line's own category over the transaction's", async () => {
      const item = {
        ...transaction().items[0],
        category: { name: 'Snacks' },
        categoryId: 'cat-2',
      };
      const { service } = makeService({
        transactions: [transaction({ items: [item] })],
      });
      const body = (await service.export('user-1', 'csv', NOW)).body;
      expect(body).toContain(',Wallet,Snacks,-12.345,');
    });

    it('escapes a description with a comma, a quote and a newline', async () => {
      const { service } = makeService({
        transactions: [
          transaction({ description: 'Dinner, "Chez Ali"\nsplit' }),
        ],
      });
      const body = (await service.export('user-1', 'csv', NOW)).body;
      expect(body).toContain(
        '\r\n2026-10-20T09:00:00.000Z,"Dinner, ""Chez Ali""\nsplit",EXPENSE,',
      );
    });
  });

  it('scopes every query to the caller and skips deleted transactions', async () => {
    const { service, prisma } = makeService();
    await service.export('user-1', 'json', NOW);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: accountScope('user-1', 'view') }),
    );
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { userId: 'user-1' },
            { userId: null },
            { user: { accounts: { some: accountScope('user-1', 'view') } } },
          ],
        },
      }),
    );
    const onMyAccounts = { accountId: { in: ['a1'] } };
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, items: { some: onMyAccounts } },
      }),
    );
    expect(prisma.goal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: onMyAccounts }),
    );
  });

  it('404s when the user no longer exists', async () => {
    const { service } = makeService({ user: null });
    await expect(service.export('gone', 'json', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('exportTracker', () => {
  it("keys on the signed-in user's id", () => {
    expect(exportTracker({ ip: '1.2.3.4', user: { id: 'user-1' } })).toBe(
      'export:user-1',
    );
  });

  it('gives the same user the same key from any IP', () => {
    expect(exportTracker({ ip: '1.2.3.4', user: { id: 'u' } })).toBe(
      exportTracker({ ip: '5.6.7.8', user: { id: 'u' } }),
    );
  });

  it('falls back to the IP without a user', () => {
    expect(exportTracker({ ip: '5.6.7.8' })).toBe('ip:5.6.7.8');
  });
});

describe('ExportThrottlerGuard', () => {
  it('applies the per-user limit regardless of the global one', async () => {
    const guard = Object.create(
      ExportThrottlerGuard.prototype,
    ) as ExportThrottlerGuard;
    const parent = Object.getPrototypeOf(ExportThrottlerGuard.prototype) as {
      handleRequest(props: ThrottlerRequest): Promise<boolean>;
    };
    const spy = jest.spyOn(parent, 'handleRequest').mockResolvedValue(true);

    await (
      guard as unknown as {
        handleRequest(p: ThrottlerRequest): Promise<boolean>;
      }
    ).handleRequest({
      limit: 300,
      ttl: 60_000,
      blockDuration: 60_000,
    } as ThrottlerRequest);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: EXPORT_THROTTLE.limit,
        ttl: EXPORT_THROTTLE.ttl,
        blockDuration: EXPORT_THROTTLE.ttl,
      }),
    );
    spy.mockRestore();
  });
});
