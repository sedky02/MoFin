/**
 * Default categories on registration, and archiving a category that is in
 * use, through the real controllers, services and HTTP stack. Prisma is
 * replaced by an in-memory store that applies the same filters Prisma would
 * (`archivedAt`, `deletedAt: null`), so no database is touched and it runs
 * with a plain `npm run test:e2e -- categories`.
 */
import { CanActivate, ExecutionContext, INestApplication, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrismaService } from '../src/database/prisma.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import { CategoriesController } from '../src/modules/categories/categories.controller';
import { CategoriesService } from '../src/modules/categories/categories.service';
import { DEFAULT_CATEGORIES } from '../src/modules/categories/default-categories';
import { UsersService } from '../src/modules/users/users.service';

type UserRow = { id: string; email: string; passwordHash?: string; displayName?: string };
type CategoryRow = {
  id: string;
  userId: string | null;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  color: string | null;
  icon: string | null;
  archivedAt: Date | null;
};
type TransactionRow = {
  id: string;
  userId: string;
  categoryId: string | null;
  deletedAt: Date | null;
  items: { categoryId: string | null }[];
};

const users: UserRow[] = [];
const categories: CategoryRow[] = [];
const transactions: TransactionRow[] = [];
let nextId = 1;
const id = (prefix: string) => `${prefix}-${nextId++}`;

type CategoryWhere = {
  id?: string;
  userId?: string;
  name?: string;
  type?: string;
  OR?: { userId: string | null }[];
  archivedAt?: null | { not: null };
};
function matchesCategory(c: CategoryRow, where: CategoryWhere) {
  if (where.id !== undefined && c.id !== where.id) return false;
  if (where.userId !== undefined && c.userId !== where.userId) return false;
  if (where.name !== undefined && c.name !== where.name) return false;
  if (where.type !== undefined && c.type !== where.type) return false;
  if (where.OR && !where.OR.some((o) => o.userId === c.userId)) return false;
  if (where.archivedAt === null && c.archivedAt !== null) return false;
  if (where.archivedAt && c.archivedAt === null) return false;
  return true;
}

const prismaStub = {
  user: {
    findUnique: async ({ where }: { where: { email: string } }) => users.find((u) => u.email === where.email) ?? null,
    create: async ({
      data: { categories: nested, ...data },
    }: {
      data: UserRow & { categories?: { createMany: { data: Omit<CategoryRow, 'id' | 'userId' | 'archivedAt' | 'icon'>[] } } };
    }) => {
      const user = { ...data, id: id('user') };
      users.push(user);
      for (const c of nested?.createMany.data ?? []) {
        categories.push({ icon: null, ...c, id: id('cat'), userId: user.id, archivedAt: null });
      }
      return user;
    },
  },
  category: {
    findFirst: async ({ where }: { where: CategoryWhere }) => categories.find((c) => matchesCategory(c, where)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<CategoryRow> }) => {
      const row = categories.find((c) => c.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      categories.splice(categories.findIndex((c) => c.id === where.id), 1);
    },
  },
  paginated: {
    category: {
      paginate: async ({ where, limit, offset }: { where: CategoryWhere; limit: number; offset: number }) => {
        const data = categories.filter((c) => matchesCategory(c, where)).map((c) => ({ ...c }));
        return { data, total: data.length, limit, offset };
      },
    },
  },
  transaction: {
    count: async ({ where }: { where: { deletedAt: null; OR: [{ categoryId: string }, unknown] } }) => {
      const categoryId = where.OR[0].categoryId;
      return transactions.filter(
        (t) =>
          t.deletedAt === null &&
          (t.categoryId === categoryId || t.items.some((i) => i.categoryId === categoryId)),
      ).length;
    },
  },
  budget: { count: async () => 0 },
};

@Injectable()
class HeaderUserGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-test-user'];
    if (!userId) return false;
    req.user = { id: userId };
    return true;
  }
}

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [AuthController, CategoriesController],
      providers: [
        AuthService,
        UsersService,
        CategoriesService,
        { provide: PrismaService, useValue: prismaStub },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: PasswordResetService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderUserGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (userId: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set('x-test-user', userId),
    patch: (path: string) => request(app.getHttpServer()).patch(`/api/v1${path}`).set('x-test-user', userId),
    delete: (path: string) => request(app.getHttpServer()).delete(`/api/v1${path}`).set('x-test-user', userId),
  });
  const register = (email: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'long-enough-password' });

  describe('registration', () => {
    it('gives a newly registered user the default categories', async () => {
      await register('new@example.com').expect(201);
      const user = users.find((u) => u.email === 'new@example.com')!;

      const res = await as(user.id).get('/categories?limit=100').expect(200);

      const names = res.body.data.map((c: CategoryRow) => `${c.type}:${c.name}`).sort();
      expect(names).toEqual(DEFAULT_CATEGORIES.map((c) => `${c.type}:${c.name}`).sort());
      expect(names).toEqual(
        expect.arrayContaining([
          'INCOME:Salary',
          'INCOME:Freelance',
          'EXPENSE:Groceries',
          'EXPENSE:Rent',
          'EXPENSE:Dining out',
          'EXPENSE:Transport',
          'EXPENSE:Subscriptions',
          'EXPENSE:Utilities',
        ]),
      );
      expect(res.body.data.every((c: { isSystem: boolean }) => c.isSystem === false)).toBe(true);
    });

    it('registering the same email again adds no categories and answers the same way', async () => {
      const before = categories.length;
      const first = await register('again@example.com').expect(201);
      const afterFirst = categories.length;
      const second = await register('again@example.com').expect(201);

      expect(afterFirst - before).toBe(DEFAULT_CATEGORIES.length);
      expect(categories.length).toBe(afterFirst);
      expect(second.body).toEqual(first.body);
    });
  });

  describe('archiving a category in use', () => {
    let userId: string;
    let groceries: CategoryRow;

    beforeAll(async () => {
      await register('archiver@example.com').expect(201);
      userId = users.find((u) => u.email === 'archiver@example.com')!.id;
      groceries = categories.find((c) => c.userId === userId && c.name === 'Groceries')!;
      transactions.push(
        { id: 'tx-1', userId, categoryId: groceries.id, deletedAt: null, items: [] },
        // A split line counts too, and only once per transaction.
        { id: 'tx-2', userId, categoryId: null, deletedAt: null, items: [{ categoryId: groceries.id }, { categoryId: groceries.id }] },
        // A deleted transaction doesn't.
        { id: 'tx-3', userId, categoryId: groceries.id, deletedAt: new Date(), items: [] },
      );
    });

    it('reports how many live transactions use it', async () => {
      const res = await as(userId).get(`/categories/${groceries.id}/usage`).expect(200);
      expect(res.body).toEqual({ transactions: 2, budgets: 0 });
    });

    it('refuses to delete it', async () => {
      await as(userId).delete(`/categories/${groceries.id}`).expect(409);
      expect(categories.some((c) => c.id === groceries.id)).toBe(true);
    });

    it('archives it, drops it from the default list and keeps it with ?status=all', async () => {
      const archived = await as(userId).patch(`/categories/${groceries.id}/archive`).expect(200);
      expect(archived.body.archivedAt).toEqual(expect.any(String));

      const active = await as(userId).get('/categories?limit=100').expect(200);
      expect(active.body.data.map((c: CategoryRow) => c.id)).not.toContain(groceries.id);

      const all = await as(userId).get('/categories?limit=100&status=all').expect(200);
      expect(all.body.data.map((c: CategoryRow) => c.id)).toContain(groceries.id);

      const onlyArchived = await as(userId).get('/categories?status=archived').expect(200);
      expect(onlyArchived.body.data.map((c: CategoryRow) => c.id)).toEqual([groceries.id]);
    });

    it('leaves the transactions that use it untouched', () => {
      expect(transactions.find((t) => t.id === 'tx-1')!.categoryId).toBe(groceries.id);
      expect(transactions.find((t) => t.id === 'tx-2')!.items[0].categoryId).toBe(groceries.id);
    });

    it("can't be archived or restored by another user", async () => {
      await register('other@example.com').expect(201);
      const otherId = users.find((u) => u.email === 'other@example.com')!.id;
      await as(otherId).patch(`/categories/${groceries.id}/restore`).expect(404);
      await as(otherId).patch(`/categories/${groceries.id}/archive`).expect(404);
      await as(otherId).get(`/categories/${groceries.id}/usage`).expect(404);
    });

    it('restores it to the default list', async () => {
      const restored = await as(userId).patch(`/categories/${groceries.id}/restore`).expect(200);
      expect(restored.body.archivedAt).toBeNull();

      const active = await as(userId).get('/categories?limit=100').expect(200);
      expect(active.body.data.map((c: CategoryRow) => c.id)).toContain(groceries.id);
    });

    it('404s a restore of a category that is not archived', async () => {
      await as(userId).patch(`/categories/${groceries.id}/restore`).expect(404);
    });
  });
});
