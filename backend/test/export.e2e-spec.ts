import { AccountAccessService } from '../src/modules/account-access/account-access.service';
import { ownerAccess } from './support/owner-access';
/**
 * GET /export through the real HTTP stack: the global throttler and web JWT
 * guards as AppModule registers them, the real controller, service and
 * per-user throttle, and signed web tokens. Prisma is an in-memory store
 * holding two users' data that applies the same `where` filters Prisma
 * would, so the test proves what reaches the file: the caller's live rows
 * only. No database is touched.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { GlobalJwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrismaService } from '../src/database/prisma.service';
import { WEB_AUDIENCE } from '../src/modules/auth/auth.constants';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { EXPORT_THROTTLE } from '../src/modules/export/export-throttler.guard';
import { ExportController } from '../src/modules/export/export.controller';
import { ExportService } from '../src/modules/export/export.service';

const ISSUER = 'http://localhost:3000';
const ENV = { JWT_ACCESS_SECRET: 'test-access-secret', OAUTH_ISSUER: ISSUER };
const jwt = new JwtService();
const token = (sub: string) =>
  jwt.sign(
    { sub, email: `${sub}@example.com` },
    { secret: ENV.JWT_ACCESS_SECRET, issuer: ISSUER, audience: WEB_AUDIENCE },
  );

const D = (v: string) => new Prisma.Decimal(v);
const at = (iso: string) => new Date(iso);

type Row = Record<string, unknown>;

const users: Row[] = [
  { id: 'user-1', email: 'amel@example.com', displayName: 'Amel' },
  { id: 'user-2', email: 'other@example.com', displayName: 'Other' },
  { id: 'user-3', email: 'third@example.com', displayName: null },
];

const accounts: Row[] = [
  {
    id: 'acc-wallet',
    userId: 'user-1',
    name: 'Wallet',
    type: 'CASH',
    currency: 'TND',
    openingBalance: D('150.250'),
    archivedAt: null,
    createdAt: at('2026-01-01T00:00:00Z'),
  },
  {
    id: 'acc-old',
    userId: 'user-1',
    name: 'Old savings',
    type: 'SAVINGS',
    currency: 'TND',
    openingBalance: D('0'),
    archivedAt: at('2026-09-01T00:00:00Z'),
    createdAt: at('2026-01-02T00:00:00Z'),
  },
  {
    id: 'acc-other',
    userId: 'user-2',
    name: 'Their bank',
    type: 'BANK',
    currency: 'EUR',
    openingBalance: D('0'),
    archivedAt: null,
    createdAt: at('2026-01-01T00:00:00Z'),
  },
];

const categories: Row[] = [
  {
    id: 'cat-food',
    userId: null,
    name: 'Food',
    type: 'EXPENSE',
    color: null,
    icon: null,
  },
  {
    id: 'cat-mine',
    userId: 'user-1',
    name: 'Hobbies',
    type: 'EXPENSE',
    color: '#ff0000',
    icon: 'star',
  },
  {
    id: 'cat-theirs',
    userId: 'user-2',
    name: 'Their secret category',
    type: 'EXPENSE',
    color: null,
    icon: null,
  },
];

function item(
  id: string,
  accountId: string,
  accountName: string,
  direction: 'DEBIT' | 'CREDIT',
  amount: string,
  userId = 'user-1',
) {
  return {
    id,
    userId,
    accountId,
    account: { name: accountName },
    categoryId: null,
    category: null,
    direction,
    amount: D(amount),
    currency: 'TND',
    memo: null,
  };
}

function tx(fields: Row): Row {
  return {
    userId: 'user-1',
    currency: 'TND',
    categoryId: null,
    category: null,
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
    createdAt: at('2026-10-01T00:00:00Z'),
    ...fields,
  };
}

const transactions: Row[] = [
  tx({
    id: 'tx-groceries',
    type: 'EXPENSE',
    description: 'Groceries, "bio" market',
    occurredAt: at('2026-10-02T10:00:00Z'),
    categoryId: 'cat-food',
    category: { name: 'Food' },
    items: [item('i-1', 'acc-wallet', 'Wallet', 'DEBIT', '12.345')],
  }),
  tx({
    id: 'tx-deleted',
    type: 'EXPENSE',
    description: 'Deleted by mistake',
    occurredAt: at('2026-10-03T10:00:00Z'),
    deletedAt: at('2026-10-04T00:00:00Z'),
    items: [item('i-2', 'acc-wallet', 'Wallet', 'DEBIT', '99.000')],
  }),
  tx({
    id: 'tx-transfer',
    type: 'TRANSFER',
    description: 'Move to savings',
    occurredAt: at('2026-08-15T10:00:00Z'),
    items: [
      item('i-3', 'acc-wallet', 'Wallet', 'DEBIT', '250.5'),
      item('i-4', 'acc-old', 'Old savings', 'CREDIT', '250.5'),
    ],
  }),
  tx({
    id: 'tx-salary',
    type: 'INCOME',
    description: 'Salary',
    occurredAt: at('2026-10-01T08:00:00Z'),
    isRecurring: true,
    recurringInterval: 'MONTHLY',
    recurringStatus: 'ACTIVE',
    nextOccurrenceAt: at('2026-11-01T08:00:00Z'),
    recurringAmount: D('3200.125'),
    recurringToAccountId: 'acc-wallet',
    items: [item('i-5', 'acc-wallet', 'Wallet', 'CREDIT', '3200.125')],
  }),
  tx({
    id: 'tx-theirs',
    userId: 'user-2',
    type: 'EXPENSE',
    description: 'Their rent',
    currency: 'EUR',
    occurredAt: at('2026-10-02T10:00:00Z'),
    items: [item('i-6', 'acc-other', 'Their bank', 'DEBIT', '800', 'user-2')],
  }),
];

const goals: Row[] = [
  {
    id: 'goal-mine',
    userId: 'user-1',
    accountId: 'acc-wallet',
    name: 'Emergency fund',
    type: 'BALANCE',
    targetAmount: D('5000.500'),
    isRecurring: false,
    recurrenceUnit: null,
    periodStart: at('2026-01-01T00:00:00Z'),
    periodEnd: at('2026-12-31T23:59:59.999Z'),
    archivedAt: null,
    createdAt: at('2026-01-01T00:00:00Z'),
    instances: [
      {
        id: 'gi-1',
        goalId: 'goal-mine',
        periodStart: at('2026-01-01T00:00:00Z'),
        periodEnd: at('2026-12-31T23:59:59.999Z'),
        targetAmount: D('5000.500'),
        progressAmount: D('2950.125'),
        status: 'IN_PROGRESS',
      },
    ],
  },
  {
    id: 'goal-theirs',
    userId: 'user-2',
    accountId: 'acc-other',
    name: 'Their goal',
    type: 'EXPENSE',
    targetAmount: D('100'),
    isRecurring: false,
    recurrenceUnit: null,
    periodStart: at('2026-01-01T00:00:00Z'),
    periodEnd: at('2026-12-31T23:59:59.999Z'),
    archivedAt: null,
    createdAt: at('2026-01-01T00:00:00Z'),
    instances: [],
  },
];

/** The subset of Prisma's `where` the export uses: equality, `null` and `OR`. */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Row[]).some((w) => matches(row, w));
    if (key === 'items')
      return (row.items as Row[]).some((item) =>
        matches(item, (value as { some: Row }).some),
      );
    if (value !== null && typeof value === 'object' && 'in' in value)
      return (value.in as unknown[]).includes(row[key]);
    if (value === null) return row[key] === null || row[key] === undefined;
    return row[key] === value;
  });
}
const findMany = (rows: Row[]) =>
  jest.fn(async ({ where }: { where?: Row } = {}) =>
    rows.filter((r) => matches(r, where)),
  );

const prismaStub = {
  user: {
    findUnique: jest.fn(
      async ({ where }: { where: { id: string } }) =>
        users.find((u) => u.id === where.id) ?? null,
    ),
  },
  account: {
    findMany: findMany(accounts.map((a) => ({ ...a, members: [] }))),
  },
  category: { findMany: findMany(categories) },
  transaction: { findMany: findMany(transactions) },
  goal: { findMany: findMany(goals) },
};

describe('GET /export (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [ExportController],
      providers: [
        // Same order as AppModule.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: GlobalJwtAuthGuard },
        { provide: ConfigService, useValue: new ConfigService(ENV) },
        JwtStrategy,
        ExportService,
        { provide: PrismaService, useValue: prismaStub },
        {
          provide: AccountAccessService,
          useValue: ownerAccess(accounts as { id: string; userId: string }[]),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (query: string, user?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1/export${query}`);
    return user ? req.auth(token(user), { type: 'bearer' }) : req;
  };

  it('needs a web token', async () => {
    await get('?format=json').expect(401);
    await get('?format=csv').expect(401);
    expect(prismaStub.transaction.findMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown format', async () => {
    await get('?format=xml', 'user-1').expect(400);
  });

  describe('JSON', () => {
    it("holds every live row of the caller's, and nothing else", async () => {
      const res = await get('?format=json', 'user-1');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="mofin-export-\d{4}-\d{2}-\d{2}\.json"$/,
      );

      const doc = res.body;
      expect(doc.user).toEqual({
        email: 'amel@example.com',
        displayName: 'Amel',
      });
      expect(doc.accounts.map((a: Row) => a.id).sort()).toEqual([
        'acc-old',
        'acc-wallet',
      ]);
      expect(doc.accounts.find((a: Row) => a.id === 'acc-old')).toEqual(
        expect.objectContaining({
          currency: 'TND',
          archivedAt: '2026-09-01T00:00:00.000Z',
        }),
      );
      expect(doc.categories.map((c: Row) => [c.id, c.isSystem]).sort()).toEqual(
        [
          ['cat-food', true],
          ['cat-mine', false],
        ],
      );
      expect(doc.transactions.map((t: Row) => t.id).sort()).toEqual([
        'tx-groceries',
        'tx-salary',
        'tx-transfer',
      ]);
      expect(doc.goals.map((g: Row) => g.id)).toEqual(['goal-mine']);
      expect(JSON.stringify(doc)).not.toMatch(
        /user-2|tx-deleted|Their|"userId"/,
      );
    });

    it('keeps money exact and recurrence fields', async () => {
      const doc = (await get('?format=json', 'user-1')).body;
      const salary = doc.transactions.find((t: Row) => t.id === 'tx-salary');
      expect(salary).toEqual(
        expect.objectContaining({
          isRecurring: true,
          recurringInterval: 'MONTHLY',
          recurringStatus: 'ACTIVE',
          nextOccurrenceAt: '2026-11-01T08:00:00.000Z',
          recurringAmount: '3200.125',
          recurringToAccountId: 'acc-wallet',
        }),
      );
      expect(salary.items[0]).toEqual(
        expect.objectContaining({
          amount: '3200.125',
          direction: 'CREDIT',
          accountName: 'Wallet',
        }),
      );
      const groceries = doc.transactions.find(
        (t: Row) => t.id === 'tx-groceries',
      );
      expect(groceries.items[0].amount).toBe('12.345');
      expect(
        doc.accounts.find((a: Row) => a.id === 'acc-wallet').openingBalance,
      ).toBe('150.25');
      expect(doc.goals[0].instances[0]).toEqual(
        expect.objectContaining({
          targetAmount: '5000.5',
          progressAmount: '2950.125',
        }),
      );
    });

    it('gives the other user only theirs', async () => {
      const doc = (await get('?format=json', 'user-2')).body;
      expect(doc.transactions.map((t: Row) => t.id)).toEqual(['tx-theirs']);
      expect(doc.accounts.map((a: Row) => a.id)).toEqual(['acc-other']);
      expect(doc.goals.map((g: Row) => g.id)).toEqual(['goal-theirs']);
      expect(doc.categories.map((c: Row) => c.id).sort()).toEqual([
        'cat-food',
        'cat-theirs',
      ]);
    });
  });

  describe('CSV', () => {
    it("writes one row per line of the caller's live transactions", async () => {
      const res = await get('?format=csv', 'user-1').buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="mofin-export-\d{4}-\d{2}-\d{2}\.csv"$/,
      );

      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xfeff);
      const lines = text.slice(1).trimEnd().split('\r\n');
      expect(lines[0]).toBe(
        'Date,Description,Type,Account,Category,Amount,Currency,Transaction ID',
      );
      expect(lines.slice(1)).toEqual([
        '2026-10-02T10:00:00.000Z,"Groceries, ""bio"" market",EXPENSE,Wallet,Food,-12.345,TND,tx-groceries',
        '2026-08-15T10:00:00.000Z,Move to savings,TRANSFER,Wallet,,-250.5,TND,tx-transfer',
        '2026-08-15T10:00:00.000Z,Move to savings,TRANSFER,Old savings,,250.5,TND,tx-transfer',
        '2026-10-01T08:00:00.000Z,Salary,INCOME,Wallet,,3200.125,TND,tx-salary',
      ]);
      expect(text).not.toMatch(/tx-deleted|tx-theirs/);
    });
  });

  it(`limits each user to ${EXPORT_THROTTLE.limit} exports an hour, without blocking others`, async () => {
    for (let i = 0; i < EXPORT_THROTTLE.limit; i++)
      await get('?format=csv', 'user-3').expect(200);
    const blocked = await get('?format=csv', 'user-3');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    await get('?format=csv', 'user-2').expect(200);
  });
});
