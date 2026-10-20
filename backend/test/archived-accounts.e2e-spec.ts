import { CanActivate, ExecutionContext, INestApplication, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrismaService } from '../src/database/prisma.service';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import { CategoriesService } from '../src/modules/categories/categories.service';
import { LedgerController } from '../src/modules/ledger/ledger.controller';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { TransactionsController } from '../src/modules/transactions/transactions.controller';
import { TransactionsService } from '../src/modules/transactions/transactions.service';

/**
 * Archived accounts are read-only, not invisible: their balance can still be
 * read, but nothing new can be posted to them. Real controllers and services
 * (AccountsService included, so the archived/active rule is the one the app
 * runs) behind the real `api/v1` prefix, with Prisma replaced by an in-memory
 * store that applies the same `archivedAt: null` filter Prisma would. No
 * database is touched.
 */

const USER_ID = 'user-1';

const accounts = [
  { id: '201bcfd6-0000-4000-8000-000000000001', userId: USER_ID, name: 'Main checking', currency: 'USD', archivedAt: null as Date | null },
  { id: '201bcfd6-0000-4000-8000-000000000003', userId: USER_ID, name: 'Old savings', currency: 'EUR', archivedAt: new Date('2026-09-01T00:00:00Z') as Date | null },
];
const [main, old] = accounts;

type Item = { accountId: string; direction: 'CREDIT' | 'DEBIT'; amount: string; currency: string };
const ledger: Item[] = [
  { accountId: old.id, direction: 'CREDIT', amount: '800.00', currency: 'EUR' },
  { accountId: main.id, direction: 'CREDIT', amount: '3200.00', currency: 'USD' },
  { accountId: main.id, direction: 'DEBIT', amount: '45.50', currency: 'USD' },
];
const created: unknown[] = [];

const db = {
  transaction: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `tx-${created.length + 1}`, ...data };
      created.push(row);
      return row;
    },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => created.find((t) => (t as { id: string }).id === where.id),
  },
  transactionItem: {
    createMany: async () => ({ count: 1 }),
  },
};

const prismaStub = {
  ...db,
  account: {
    findFirst: async ({ where }: { where: { id: string; userId: string; archivedAt?: null } }) => {
      const found = accounts.find((a) => a.id === where.id && a.userId === where.userId);
      if (!found || ('archivedAt' in where && found.archivedAt)) return null;
      return found;
    },
  },
  transactionItem: {
    ...db.transactionItem,
    groupBy: async ({ where }: { where: { userId: string; accountId?: string } }) => {
      const sums = new Map<string, { accountId: string; currency: string; direction: string; total: Prisma.Decimal }>();
      for (const item of ledger) {
        if (where.accountId && item.accountId !== where.accountId) continue;
        const key = `${item.accountId}:${item.currency}:${item.direction}`;
        const row = sums.get(key) ?? { accountId: item.accountId, currency: item.currency, direction: item.direction, total: new Prisma.Decimal(0) };
        row.total = row.total.plus(item.amount);
        sums.set(key, row);
      }
      return [...sums.values()].map(({ total, ...row }) => ({ ...row, _sum: { amount: total } }));
    },
  },
  $transaction: async <T>(run: (tx: typeof db) => Promise<T>) => run(db),
};

@Injectable()
class HeaderUserGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const id = req.headers['x-test-user'];
    if (!id) return false;
    req.user = { id };
    return true;
  }
}

describe('Archived accounts (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LedgerController, TransactionsController],
      providers: [
        LedgerService,
        AccountsService,
        TransactionsService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: CategoriesService, useValue: { assertAvailable: async () => ({}) } },
        { provide: EventEmitter2, useValue: { emit: () => true } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderUserGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0);
    baseUrl = `${await app.getUrl()}/api/v1`.replace('[::1]', 'localhost');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    created.length = 0;
  });

  const get = (path: string, user = USER_ID) => fetch(`${baseUrl}${path}`, { headers: { 'x-test-user': user } });
  const post = (path: string, body: object) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'x-test-user': USER_ID, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('GET /ledger/balance?accountId=<archived> returns its real balance', async () => {
    const res = await get(`/ledger/balance?accountId=${old.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ key: 'EUR', balance: '800' }]);
  });

  it("GET /ledger/balance?accountId=<archived> still 404s for another user", async () => {
    const res = await get(`/ledger/balance?accountId=${old.id}`, 'someone-else');
    expect(res.status).toBe(404);
  });

  it('GET /ledger/balance (all accounts) includes the archived account', async () => {
    const res = await get('/ledger/balance');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.arrayContaining([
        { key: `${old.id}:EUR`, balance: '800' },
        { key: `${main.id}:USD`, balance: '3154.5' },
      ]),
    );
  });

  it('POST /transactions on an archived account is refused and writes nothing', async () => {
    const res = await post('/transactions', {
      type: 'EXPENSE',
      description: 'Coffee',
      amount: '4.20',
      currency: 'EUR',
      occurredAt: '2026-10-20T09:00:00Z',
      fromAccountId: old.id,
    });
    expect(res.status).toBe(404);
    expect(created).toHaveLength(0);
  });

  it('POST /transactions transferring into an archived account is refused', async () => {
    const res = await post('/transactions', {
      type: 'TRANSFER',
      description: 'Top up old savings',
      amount: '10.00',
      currency: 'EUR',
      occurredAt: '2026-10-20T09:00:00Z',
      fromAccountId: main.id,
      toAccountId: old.id,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(created).toHaveLength(0);
  });

  it('POST /transactions on an active account still goes through', async () => {
    const res = await post('/transactions', {
      type: 'EXPENSE',
      description: 'Coffee',
      amount: '4.20',
      currency: 'USD',
      occurredAt: '2026-10-20T09:00:00Z',
      fromAccountId: main.id,
    });
    expect(res.status).toBe(201);
    expect(created).toHaveLength(1);
  });
});
