import { CanActivate, ExecutionContext, INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, TransactionType } from '@prisma/client';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrismaService } from '../src/database/prisma.service';
import { AnalyticsController } from '../src/modules/analytics/analytics.controller';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';

/**
 * HTTP-level check of GET /analytics/monthly-summary: the real controller,
 * validation pipe and service behind the `api/v1` prefix, with Prisma replaced
 * by an in-memory store. No database is touched.
 *
 * The fixture is one active TND account plus an archived EUR account that still
 * had income and spending this month, the case where an all-accounts summary
 * used to add the two currencies together.
 */

const USER_ID = 'user-1';
const TND = 'acc-tnd';
const EUR_ARCHIVED = 'acc-eur-archived';

const item = (accountId: string, amount: string, currency: string) => ({
  accountId,
  amount: new Prisma.Decimal(amount),
  currency,
  categoryId: null,
  category: null,
});

const transactions = [
  { userId: USER_ID, type: TransactionType.INCOME, categoryId: null, category: null, items: [item(TND, '2500', 'TND')] },
  {
    userId: USER_ID,
    type: TransactionType.EXPENSE,
    categoryId: 'cat-rent',
    category: { name: 'Rent', color: null },
    items: [item(TND, '900', 'TND')],
  },
  { userId: USER_ID, type: TransactionType.INCOME, categoryId: null, category: null, items: [item(EUR_ARCHIVED, '120', 'EUR')] },
  {
    userId: USER_ID,
    type: TransactionType.EXPENSE,
    categoryId: 'cat-travel',
    category: { name: 'Travel', color: null },
    items: [item(EUR_ARCHIVED, '45.50', 'EUR')],
  },
];

const prismaStub = {
  analyticsCache: {
    findUnique: async () => null,
    upsert: async () => undefined,
  },
  transaction: {
    findMany: async ({ where }: { where: { userId: string; items?: { some: { accountId: string } } } }) =>
      transactions.filter(
        (t) => t.userId === where.userId && (!where.items || t.items.some((i) => i.accountId === where.items?.some.accountId)),
      ),
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

describe('Analytics API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [AnalyticsService, { provide: PrismaService, useValue: prismaStub }],
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

  const get = (path: string) => fetch(`${baseUrl}${path}`, { headers: { 'x-test-user': USER_ID } });

  it('GET /analytics/monthly-summary without accountId and without currency is a 400', async () => {
    const res = await get('/analytics/monthly-summary?year=2026&month=10');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toEqual([expect.objectContaining({ path: 'currency' })]);
  });

  it('an all-accounts summary only adds up the requested currency', async () => {
    const tnd = await (await get('/analytics/monthly-summary?year=2026&month=10&currency=TND')).json();
    expect(tnd).toEqual(
      expect.objectContaining({
        income: '2500',
        expenses: '900',
        categoryBreakdown: [{ category: 'Rent', color: null, amount: '900' }],
      }),
    );

    const eur = await (await get('/analytics/monthly-summary?year=2026&month=10&currency=EUR')).json();
    expect(eur).toEqual(
      expect.objectContaining({
        income: '120',
        expenses: '45.5',
        categoryBreakdown: [{ category: 'Travel', color: null, amount: '45.5' }],
      }),
    );
  });

  it("lists the archived account's currency among the month's active currencies", async () => {
    const body = await (await get('/analytics/monthly-summary?year=2026&month=10&currency=TND')).json();
    expect(body.activeCurrencies).toEqual(['EUR', 'TND']);
  });

  it('an account-scoped summary still works without a currency', async () => {
    const res = await get(`/analytics/monthly-summary?year=2026&month=10&accountId=${TND}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ income: '2500', expenses: '900', activeCurrencies: ['TND'] }));
  });
});
