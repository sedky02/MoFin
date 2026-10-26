/**
 * Deleting an account, through the real controllers, guards (global
 * throttler + web JWT, the per-user delete limit), validation, UsersService
 * and AuthService (to check the login afterwards).
 *
 * Prisma is replaced by an in-memory database whose foreign keys are read
 * from schema.prisma, with Postgres semantics: CASCADE deletes the children,
 * SET NULL clears the column, RESTRICT refuses the delete while a child
 * still points at the row, and a failed transaction is rolled back. So it
 * needs no database and runs with a plain `npm run test:e2e -- delete-account`.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DELETE_ACCOUNT_THROTTLE } from '../src/common/guards/auth-throttler.guard';
import { GlobalJwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrismaService } from '../src/database/prisma.service';
import { WEB_AUDIENCE } from '../src/modules/auth/auth.constants';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';

const ENV = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  REFRESH_TOKEN_SECRET: 'test-refresh-token-secret-of-32-chars',
  OAUTH_ISSUER: 'http://localhost:3000',
};

type Row = Record<string, unknown> & { id: string };
type OnDelete = 'Cascade' | 'Restrict' | 'SetNull';
interface Relation {
  /** Prisma delegate name of the table holding the foreign key, e.g. `goalInstance`. */
  child: string;
  /** Relation field name, e.g. `goal` (used by relation filters). */
  name: string;
  /** Foreign key column, e.g. `goalId`. */
  column: string;
  parent: string;
  onDelete: OnDelete;
}

const delegateName = (model: string) => model[0].toLowerCase() + model.slice(1);

/** Every model and foreign key in schema.prisma, so the fake follows the real schema. */
function readSchema(): { tables: string[]; relations: Relation[] } {
  const schema = readFileSync(
    join(__dirname, '..', 'prisma', 'schema.prisma'),
    'utf8',
  );
  const tables: string[] = [];
  const relations: Relation[] = [];
  for (const [, model, body] of schema.matchAll(
    /^model (\w+) \{([\s\S]*?)^\}/gm,
  )) {
    tables.push(delegateName(model));
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*(\w+)\s+(\w+)(\?)?\s+@relation\(([^)]*)\)/);
      const column = m?.[4].match(/fields:\s*\[(\w+)\]/)?.[1];
      if (!m || !column) continue;
      // Prisma's defaults when onDelete is left out.
      const onDelete = (m[4].match(/onDelete:\s*(\w+)/)?.[1] ??
        (m[3] ? 'SetNull' : 'Restrict')) as OnDelete;
      relations.push({
        child: delegateName(model),
        name: m[1],
        column,
        parent: delegateName(m[2]),
        onDelete,
      });
    }
  }
  return { tables, relations };
}

const SCHEMA = readSchema();
/** Tables holding a `userId`: everything that belongs to a user directly. */
const USER_TABLES = SCHEMA.relations
  .filter((r) => r.parent === 'user')
  .map((r) => r.child);

/** Prisma's delegate API over arrays, with the schema's foreign keys enforced. */
function inMemoryPrisma() {
  let tables: Record<string, Row[]> = Object.fromEntries(
    SCHEMA.tables.map((t) => [t, []]),
  );
  let nextId = 0;

  function matches(
    table: string,
    row: Row,
    where: Record<string, unknown>,
  ): boolean {
    return Object.entries(where).every(([key, value]) => {
      const relation = SCHEMA.relations.find(
        (r) => r.child === table && r.name === key,
      );
      if (relation) {
        const parent = tables[relation.parent].find(
          (p) => p.id === row[relation.column],
        );
        return (
          !!parent &&
          matches(relation.parent, parent, value as Record<string, unknown>)
        );
      }
      if (value && typeof value === 'object' && 'not' in value)
        return (row[key] ?? null) !== (value as { not: unknown }).not;
      return (row[key] ?? null) === value;
    });
  }

  /** Deletes rows the way Postgres applies each referencing foreign key. */
  function remove(table: string, doomed: Row[]) {
    if (!doomed.length) return;
    const ids = new Set(doomed.map((r) => r.id));
    tables[table] = tables[table].filter((r) => !ids.has(r.id));
    for (const rel of SCHEMA.relations.filter((r) => r.parent === table)) {
      const children = tables[rel.child].filter((c) =>
        ids.has(c[rel.column] as string),
      );
      if (!children.length) continue;
      if (rel.onDelete === 'Restrict') {
        throw new Error(
          `Foreign key ${rel.child}.${rel.column} still references a deleted ${table}`,
        );
      }
      if (rel.onDelete === 'SetNull')
        children.forEach((c) => (c[rel.column] = null));
      else remove(rel.child, children);
    }
  }

  const delegate = (table: string) => ({
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const row = tables[table].find((r) => matches(table, r, where));
      return row ? { ...row } : null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: Row = { id: `${table}-${++nextId}`, ...data };
      tables[table].push(row);
      return { ...row };
    },
    update: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const row = tables[table].find((r) => matches(table, r, where));
      if (!row) throw new Error('record not found');
      return { ...Object.assign(row, data) };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const hit = tables[table].filter((r) => matches(table, r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    delete: async ({ where }: { where: Record<string, unknown> }) => {
      const row = tables[table].find((r) => matches(table, r, where));
      if (!row) throw new Error('record not found');
      remove(table, [row]);
      return { ...row };
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const hit = tables[table].filter((r) => matches(table, r, where));
      remove(table, hit);
      return { count: hit.length };
    },
  });

  const prisma: Record<string, unknown> & {
    tables: () => Record<string, Row[]>;
  } = {
    tables: () => tables,
    $transaction: async (run: (tx: unknown) => unknown) => {
      const before = structuredClone(tables);
      try {
        return await run(prisma);
      } catch (err) {
        tables = before;
        throw err;
      }
    },
  };
  for (const table of SCHEMA.tables) prisma[table] = delegate(table);
  return prisma;
}

type Db = ReturnType<typeof inMemoryPrisma>;

/** A user with a row in every table that can belong to one. */
function seedUser(db: Db, id: string, passwordHash: string | null) {
  const t = db.tables();
  const add = (table: string, row: Row) => t[table].push(row);
  const at = new Date('2026-10-01T00:00:00Z');

  add('user', {
    id,
    email: `${id}@example.com`,
    passwordHash,
    googleId: passwordHash ? null : `google-${id}`,
  });
  add('account', {
    id: `${id}-cash`,
    userId: id,
    name: 'Cash',
    currency: 'EUR',
  });
  add('account', {
    id: `${id}-bank`,
    userId: id,
    name: 'Bank',
    currency: 'EUR',
  });
  add('category', {
    id: `${id}-cat`,
    userId: id,
    name: 'Mine',
    type: 'EXPENSE',
  });
  add('draftTransaction', {
    id: `${id}-draft`,
    userId: id,
    rawInput: 'coffee 3',
    status: 'APPROVED',
  });
  add('transaction', {
    id: `${id}-tx`,
    userId: id,
    draftId: `${id}-draft`,
    categoryId: 'global-cat',
    occurredAt: at,
    deletedAt: null,
  });
  add('transaction', {
    id: `${id}-tx-deleted`,
    userId: id,
    categoryId: `${id}-cat`,
    occurredAt: at,
    deletedAt: at,
  });
  add('transaction', {
    id: `${id}-root`,
    userId: id,
    occurredAt: at,
    isRecurring: true,
    recurringFromAccountId: `${id}-bank`,
    recurringToAccountId: `${id}-cash`,
    deletedAt: null,
  });
  add('transaction', {
    id: `${id}-occurrence`,
    userId: id,
    parentTransactionId: `${id}-root`,
    occurredAt: at,
    deletedAt: null,
  });
  for (const tx of ['tx', 'tx-deleted', 'root', 'occurrence']) {
    add('transactionItem', {
      id: `${id}-${tx}-debit`,
      userId: id,
      transactionId: `${id}-${tx}`,
      accountId: `${id}-bank`,
      categoryId: `${id}-cat`,
    });
    add('transactionItem', {
      id: `${id}-${tx}-credit`,
      userId: id,
      transactionId: `${id}-${tx}`,
      accountId: `${id}-cash`,
      categoryId: null,
    });
  }
  add('budget', { id: `${id}-budget`, userId: id, categoryId: `${id}-cat` });
  add('goal', {
    id: `${id}-goal`,
    userId: id,
    accountId: `${id}-bank`,
    archivedAt: null,
  });
  add('goalInstance', { id: `${id}-goal-oct`, goalId: `${id}-goal` });
  add('analyticsCache', { id: `${id}-cache`, userId: id, cacheKey: 'summary' });
  add('refreshToken', {
    id: `${id}-rt`,
    userId: id,
    tokenHash: `${id}-rt-hash`,
    familyId: 'f',
    revokedAt: null,
    rotatedToId: null,
  });
  add('authSession', {
    id: `${id}-session`,
    userId: id,
    sessionToken: `${id}-session-hash`,
  });
  add('passwordResetToken', {
    id: `${id}-reset`,
    userId: id,
    tokenHash: `${id}-reset-hash`,
    usedAt: null,
  });
  add('oAuthRefreshToken', {
    id: `${id}-ort`,
    userId: id,
    tokenHash: `${id}-ort-hash`,
    clientId: 'claude',
    familyId: 'g',
  });
  add('authorizationCode', {
    id: `${id}-code`,
    userId: id,
    code: `${id}-code-hash`,
    clientId: 'claude',
  });
  add('oAuthGrant', {
    id: `${id}-grant`,
    userId: id,
    clientId: 'claude',
    scope: 'mcp',
  });
}

/** Rows per table that belong to `userId`, directly or through a parent (goal instances). */
function ownedBy(db: Db, userId: string): Record<string, number> {
  const t = db.tables();
  const owns = (table: string, row: Row): boolean => {
    if (table === 'user') return row.id === userId;
    if (row.userId !== undefined) return row.userId === userId;
    return SCHEMA.relations
      .filter((r) => r.child === table)
      .some((r) => {
        const parent = t[r.parent].find((p) => p.id === row[r.column]);
        return !!parent && owns(r.parent, parent);
      });
  };
  return Object.fromEntries(
    SCHEMA.tables.map((table) => [
      table,
      t[table].filter((row) => owns(table, row)).length,
    ]),
  );
}

describe('DELETE /users/me (e2e)', () => {
  let app: INestApplication<App>;
  let db: Db;
  let ipCounter = 0;
  const nextIp = () => `10.40.0.${++ipCounter}`;
  const jwt = new JwtService();
  const tokenFor = (sub: string) =>
    jwt.sign(
      { sub, email: `${sub}@example.com` },
      {
        secret: ENV.JWT_ACCESS_SECRET,
        issuer: ENV.OAUTH_ISSUER,
        audience: WEB_AUDIENCE,
      },
    );

  beforeEach(async () => {
    db = inMemoryPrisma();
    const passwordHash = await bcrypt.hash('right-password', 4);
    db.tables().category.push({
      id: 'global-cat',
      userId: null,
      name: 'Groceries',
      type: 'EXPENSE',
    });
    seedUser(db, 'u1', passwordHash);
    seedUser(db, 'u2', passwordHash);
    seedUser(db, 'g1', null);

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [AuthController, UsersController],
      providers: [
        // Same order as AppModule.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: GlobalJwtAuthGuard },
        { provide: ConfigService, useValue: new ConfigService(ENV) },
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: db },
        { provide: PasswordResetService, useValue: {} },
        JwtStrategy,
        UsersService,
        AuthService,
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    nestApp.set('trust proxy', 1);
    nestApp.setGlobalPrefix('api/v1');
    await nestApp.init();
    app = nestApp as unknown as INestApplication<App>;
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const login = (email: string, password = 'right-password') =>
    http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password });
  const deleteAccount = (
    accessToken: string,
    body: object,
    ip = '203.0.113.7',
  ) =>
    http()
      .delete('/api/v1/users/me')
      .set('X-Forwarded-For', ip)
      .auth(accessToken, { type: 'bearer' })
      .send(body);

  it('seeds a row in every table a user can own, so the checks below cover them all', () => {
    for (const id of ['u1', 'g1']) {
      const owned = ownedBy(db, id);
      const empty = [...USER_TABLES, 'goalInstance', 'user'].filter(
        (table) => !(owned[table] > 0),
      );
      expect({ id, empty }).toEqual({ id, empty: [] });
    }
  });

  it('needs a web session', async () => {
    await http()
      .delete('/api/v1/users/me')
      .send({ password: 'right-password' })
      .expect(401);
    expect(ownedBy(db, 'u1').user).toBe(1);
  });

  it("deletes the account and all of its data, soft-deleted rows included, and nobody else's", async () => {
    const session = (await login('u1@example.com').expect(201)).body as {
      accessToken: string;
      refreshToken: string;
    };
    const otherBefore = ownedBy(db, 'u2');
    const googleBefore = ownedBy(db, 'g1');

    await deleteAccount(session.accessToken, {
      password: 'right-password',
    }).expect(204, '');

    const left = Object.entries(ownedBy(db, 'u1')).filter(
      ([, rows]) => rows > 0,
    );
    expect(left).toEqual([]);
    // Nothing anywhere still points at a deleted row of theirs.
    expect(JSON.stringify(db.tables())).not.toMatch(/"u1[-"]/);

    expect(ownedBy(db, 'u2')).toEqual(otherBefore);
    expect(ownedBy(db, 'g1')).toEqual(googleBefore);
    // Global categories belong to nobody and stay; u2's ledger still uses one.
    expect(
      db.tables().category.find((c) => c.id === 'global-cat'),
    ).toBeDefined();
    expect(db.tables().transaction.find((t) => t.id === 'u2-tx')).toMatchObject(
      { categoryId: 'global-cat' },
    );

    // The account is gone: no login, no session renewal. Others still sign in.
    await login('u1@example.com').expect(401);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    await login('u2@example.com').expect(201);
  });

  it('refuses a wrong password with a field error and deletes nothing', async () => {
    const before = structuredClone(db.tables());

    for (const body of [
      { password: 'wrong-password' },
      {},
      { confirmEmail: 'u1@example.com' },
    ]) {
      const res = await deleteAccount(tokenFor('u1'), body);
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([
        { path: 'password', message: expect.any(String) },
      ]);
    }

    expect(db.tables()).toEqual(before);
    await login('u1@example.com').expect(201);
  });

  it('asks a Google-only account to type its email instead', async () => {
    const wrong = await deleteAccount(tokenFor('g1'), {
      confirmEmail: 'u1@example.com',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors).toEqual([
      { path: 'confirmEmail', message: expect.any(String) },
    ]);
    expect(ownedBy(db, 'g1').user).toBe(1);

    await deleteAccount(tokenFor('g1'), {
      confirmEmail: 'G1@example.com',
    }).expect(204);
    expect(Object.values(ownedBy(db, 'g1')).every((rows) => rows === 0)).toBe(
      true,
    );
    expect(ownedBy(db, 'u1').user).toBe(1);
  });

  it('rolls back everything if any step fails', async () => {
    const before = structuredClone(db.tables());
    const authSession = (
      db as unknown as Record<string, { deleteMany: () => Promise<unknown> }>
    ).authSession;
    authSession.deleteMany = async () => {
      throw new Error('connection lost');
    };

    await deleteAccount(tokenFor('u1'), { password: 'right-password' }).expect(
      500,
    );

    expect(db.tables()).toEqual(before);
  });

  it('limits attempts per user, across IPs', async () => {
    for (let i = 0; i < DELETE_ACCOUNT_THROTTLE.limit; i++) {
      await deleteAccount(
        tokenFor('u1'),
        { password: 'guess' },
        `198.51.100.${i + 1}`,
      ).expect(400);
    }
    const res = await deleteAccount(
      tokenFor('u1'),
      { password: 'right-password' },
      '198.51.100.99',
    );
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(ownedBy(db, 'u1').user).toBe(1);

    // Another user is unaffected.
    await deleteAccount(tokenFor('u2'), { password: 'guess' }).expect(400);
  });
});
