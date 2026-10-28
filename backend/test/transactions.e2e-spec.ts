import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrismaService } from '../src/database/prisma.service';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import { CategoriesService } from '../src/modules/categories/categories.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { SearchController } from '../src/modules/search/search.controller';
import { SearchService } from '../src/modules/search/search.service';
import { TransactionsController } from '../src/modules/transactions/transactions.controller';
import { RecurringSeriesService } from '../src/modules/transactions/recurring-series.service';
import { TransactionsService } from '../src/modules/transactions/transactions.service';

/**
 * HTTP-level check of the transaction response shape: real controllers and
 * services behind the real `api/v1` prefix, with Prisma replaced by an
 * in-memory store. The store only joins `items[].account` when the query asks
 * for it (like Prisma does), so dropping the include from the service makes
 * these tests fail. No database is touched.
 */

const USER_ID = 'user-1';

const accounts = {
  main: {
    id: '201bcfd6-0000-4000-8000-000000000001',
    userId: USER_ID,
    name: 'Main checking',
    type: 'BANK',
    currency: 'USD',
    archivedAt: null,
  },
  emergency: {
    id: '201bcfd6-0000-4000-8000-000000000002',
    userId: USER_ID,
    name: 'Emergency fund',
    type: 'SAVINGS',
    currency: 'USD',
    archivedAt: null,
  },
  old: {
    id: '201bcfd6-0000-4000-8000-000000000003',
    userId: USER_ID,
    name: 'Old savings',
    type: 'SAVINGS',
    currency: 'EUR',
    archivedAt: new Date('2026-09-01T00:00:00Z'),
  },
};

const transactions: Array<{
  id: string;
  userId: string;
  type: string;
  description: string;
  currency: string;
  occurredAt: Date;
  categoryId: null;
  deletedAt?: Date | null;
  items: Array<{
    id: string;
    accountId: string;
    categoryId: null;
    direction: string;
    amount: string;
    currency: string;
    memo: null;
  }>;
}> = [
  {
    id: 'tx-transfer',
    userId: USER_ID,
    type: 'TRANSFER',
    description: 'Emergency fund transfer',
    currency: 'USD',
    occurredAt: new Date('2026-10-02T09:00:00Z'),
    categoryId: null,
    items: [
      {
        id: 'i1',
        accountId: accounts.main.id,
        categoryId: null,
        direction: 'DEBIT',
        amount: '500.00',
        currency: 'USD',
        memo: null,
      },
      {
        id: 'i2',
        accountId: accounts.emergency.id,
        categoryId: null,
        direction: 'CREDIT',
        amount: '500.00',
        currency: 'USD',
        memo: null,
      },
    ],
  },
  {
    id: 'tx-archived',
    userId: USER_ID,
    type: 'INCOME',
    description: 'Old savings opening deposit',
    currency: 'EUR',
    occurredAt: new Date('2026-06-02T09:00:00Z'),
    categoryId: null,
    items: [
      {
        id: 'i3',
        accountId: accounts.old.id,
        categoryId: null,
        direction: 'CREDIT',
        amount: '800.00',
        currency: 'EUR',
        memo: null,
      },
    ],
  },
];

type Include = {
  items?: boolean | { include?: { account?: boolean; category?: boolean } };
  category?: boolean;
};

function project(tx: (typeof transactions)[number], include?: Include) {
  const itemInclude =
    typeof include?.items === 'object' ? include.items.include : undefined;
  return {
    ...tx,
    ...(include?.category ? { category: null } : {}),
    items: tx.items.map((item) => ({
      ...item,
      ...(itemInclude?.category ? { category: null } : {}),
      ...(itemInclude?.account
        ? {
            account:
              Object.values(accounts).find((a) => a.id === item.accountId) ??
              null,
          }
        : {}),
    })),
  };
}

const prismaStub = {
  transaction: {
    findFirst: async ({
      where,
      include,
    }: {
      where: { id: string; userId: string; deletedAt?: null };
      include?: Include;
    }) => {
      const tx = transactions.find(
        (t) =>
          t.id === where.id &&
          t.userId === where.userId &&
          !('deletedAt' in where && t.deletedAt),
      );
      return tx ? project(tx, include) : null;
    },
    // Soft delete and restore: `deletedAt: null` matches live rows, `{ not: null }` deleted ones.
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; userId: string; deletedAt: null | { not: null } };
      data: { deletedAt: Date | null };
    }) => {
      const wantDeleted = where.deletedAt !== null;
      const rows = transactions.filter(
        (t) =>
          t.id === where.id &&
          t.userId === where.userId &&
          !!t.deletedAt === wantDeleted,
      );
      for (const row of rows) row.deletedAt = data.deletedAt;
      return { count: rows.length };
    },
  },
  paginated: {
    transaction: {
      paginate: async ({
        where,
        include,
        limit,
        offset,
      }: {
        where: { userId: string; deletedAt?: null };
        include?: Include;
        limit: number;
        offset: number;
      }) => {
        const rows = transactions.filter(
          (t) =>
            t.userId === where.userId && !('deletedAt' in where && t.deletedAt),
        );
        return {
          data: rows
            .slice(offset, offset + limit)
            .map((t) => project(t, include)),
          total: rows.length,
          limit,
          offset,
        };
      },
    },
  },
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

describe('Transactions API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TransactionsController, SearchController],
      providers: [
        TransactionsService,
        RecurringSeriesService,
        SearchService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: LedgerService, useValue: {} },
        {
          provide: AccountsService,
          useValue: { assertOwned: async () => ({}) },
        },
        {
          provide: CategoriesService,
          useValue: { assertAvailable: async () => ({}) },
        },
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

  const get = (path: string, user = USER_ID) =>
    fetch(`${baseUrl}${path}`, { headers: { 'x-test-user': user } });
  const send = (method: string, path: string, user = USER_ID) =>
    fetch(`${baseUrl}${path}`, { method, headers: { 'x-test-user': user } });

  it('GET /transactions/:id returns items[].account.name for both legs of a transfer', async () => {
    const res = await get('/transactions/tx-transfer');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(
      body.items.map((i: { direction: string; account: { name: string } }) => [
        i.direction,
        i.account.name,
      ]),
    ).toEqual([
      ['DEBIT', 'Main checking'],
      ['CREDIT', 'Emergency fund'],
    ]);
  });

  it('GET /transactions/:id still names an archived account', async () => {
    const res = await get('/transactions/tx-archived');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.items[0].account).toEqual(
      expect.objectContaining({
        name: 'Old savings',
        archivedAt: expect.any(String),
      }),
    );
  });

  it("GET /transactions/:id 404s for another user's transaction", async () => {
    const res = await get('/transactions/tx-transfer', 'someone-else');
    expect(res.status).toBe(404);
  });

  it('GET /search/transactions returns items[].account.name on every result', async () => {
    const res = await get('/search/transactions?limit=20&offset=0');
    expect(res.status).toBe(200);
    const body = await res.json();

    const names = body.data.flatMap(
      (t: { items: Array<{ account: { name: string } }> }) =>
        t.items.map((i) => i.account.name),
    );
    expect(names).toEqual(['Main checking', 'Emergency fund', 'Old savings']);
  });

  it('DELETE soft-deletes: the transaction 404s and leaves search, and restore brings it back', async () => {
    expect((await send('DELETE', '/transactions/tx-transfer')).status).toBe(
      204,
    );
    expect((await get('/transactions/tx-transfer')).status).toBe(404);
    const search = await (
      await get('/search/transactions?limit=20&offset=0')
    ).json();
    expect(search.data.map((t: { id: string }) => t.id)).toEqual([
      'tx-archived',
    ]);

    // A second delete finds nothing live to delete.
    expect((await send('DELETE', '/transactions/tx-transfer')).status).toBe(
      404,
    );

    const restored = await send('POST', '/transactions/tx-transfer/restore');
    expect(restored.status).toBe(201);
    expect((await restored.json()).id).toBe('tx-transfer');
    expect((await get('/transactions/tx-transfer')).status).toBe(200);
    // Restoring a live transaction is a 404 too.
    expect(
      (await send('POST', '/transactions/tx-transfer/restore')).status,
    ).toBe(404);
  });

  it("can't delete or restore another user's transaction", async () => {
    expect(
      (await send('DELETE', '/transactions/tx-transfer', 'someone-else'))
        .status,
    ).toBe(404);
    expect(
      (await send('POST', '/transactions/tx-transfer/restore', 'someone-else'))
        .status,
    ).toBe(404);
    expect((await get('/transactions/tx-transfer')).status).toBe(200);
  });

  it('no longer has a void endpoint', async () => {
    expect((await send('POST', '/transactions/tx-transfer/void')).status).toBe(
      404,
    );
  });
});
