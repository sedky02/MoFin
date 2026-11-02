/**
 * Deleting an account, and deleting just its data (DELETE /users/me and
 * POST /users/me/reset-data), through the real controllers, guards (global
 * throttler + web JWT, the per-user delete limit), validation, UsersService
 * and AuthService (to check the login afterwards).
 *
 * Prisma is replaced by an in-memory database whose foreign keys are read
 * from schema.prisma, with Postgres semantics (see support/in-memory-prisma.ts).
 * So it needs no database and runs with a plain `npm run test:e2e -- delete-account`.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DEFAULT_CATEGORIES } from '../src/modules/categories/default-categories';
import { DELETE_ACCOUNT_THROTTLE } from '../src/common/guards/auth-throttler.guard';
import { GlobalJwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrismaService } from '../src/database/prisma.service';
import { WEB_AUDIENCE } from '../src/modules/auth/auth.constants';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { GoogleIdTokenVerifier } from '../src/modules/auth/id-token-verifier.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import {
  Db,
  Row,
  SCHEMA,
  USER_TABLES,
  inMemoryPrisma,
} from './support/in-memory-prisma';

const ENV = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  REFRESH_TOKEN_SECRET: 'test-refresh-token-secret-of-32-chars',
  OAUTH_ISSUER: 'http://localhost:3000',
};

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
    settings: { mainAccountId: `${id}-cash`, defaultCurrency: 'EUR' },
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

describe('deleting an account and its data (e2e)', () => {
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
        { provide: GoogleIdTokenVerifier, useValue: {} },
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
  const CONFIRM = { confirm: 'DELETE' };
  const deleteAccount = (
    accessToken: string,
    body: object = CONFIRM,
    ip = '203.0.113.7',
  ) =>
    http()
      .delete('/api/v1/users/me')
      .set('X-Forwarded-For', ip)
      .auth(accessToken, { type: 'bearer' })
      .send(body);
  const resetData = (
    accessToken: string,
    body: object = CONFIRM,
    ip = '203.0.113.7',
  ) =>
    http()
      .post('/api/v1/users/me/reset-data')
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
    await http().delete('/api/v1/users/me').send(CONFIRM).expect(401);
    await http().post('/api/v1/users/me/reset-data').send(CONFIRM).expect(401);
    expect(ownedBy(db, 'u1').user).toBe(1);
  });

  it("deletes the account and all of its data, soft-deleted rows included, and nobody else's", async () => {
    const session = (await login('u1@example.com').expect(201)).body as {
      accessToken: string;
      refreshToken: string;
    };
    const otherBefore = ownedBy(db, 'u2');
    const googleBefore = ownedBy(db, 'g1');

    await deleteAccount(session.accessToken).expect(204, '');

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

  it.each([
    ['an empty body', {}],
    ['the word in lower case', { confirm: 'delete' }],
    ['a password instead', { password: 'right-password' }],
  ])('refuses %s and deletes nothing', async (_label, body) => {
    const before = structuredClone(db.tables());

    for (const send of [deleteAccount, resetData]) {
      const res = await send(tokenFor('u1'), body);
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([
        { path: 'confirm', message: expect.any(String) },
      ]);
    }

    expect(db.tables()).toEqual(before);
    await login('u1@example.com').expect(201);
  });

  it('deletes a Google-only account the same way, with no password or email to type', async () => {
    await deleteAccount(tokenFor('g1')).expect(204);
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

    await deleteAccount(tokenFor('u1')).expect(500);

    expect(db.tables()).toEqual(before);
  });

  it('limits attempts per user, across IPs', async () => {
    for (let i = 0; i < DELETE_ACCOUNT_THROTTLE.limit; i++) {
      await deleteAccount(tokenFor('u1'), {}, `198.51.100.${i + 1}`).expect(
        400,
      );
    }
    const res = await deleteAccount(tokenFor('u1'), CONFIRM, '198.51.100.99');
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(ownedBy(db, 'u1').user).toBe(1);

    // Another user is unaffected.
    await deleteAccount(tokenFor('u2'), {}).expect(400);
  });

  describe('POST /users/me/reset-data', () => {
    /** What survives a reset: the user row, sign-ins and connected apps. */
    const KEPT = [
      'user',
      'refreshToken',
      'authSession',
      'passwordResetToken',
      'oAuthRefreshToken',
      'authorizationCode',
      'oAuthGrant',
    ];

    it("deletes everything recorded, soft-deleted rows included, keeps the profile, sign-ins and connected apps, and touches nobody else's", async () => {
      const session = (await login('u1@example.com').expect(201)).body as {
        accessToken: string;
        refreshToken: string;
      };
      const before = ownedBy(db, 'u1');
      const otherBefore = ownedBy(db, 'u2');
      const googleBefore = ownedBy(db, 'g1');

      await resetData(session.accessToken).expect(204, '');

      const after = ownedBy(db, 'u1');
      for (const table of KEPT) {
        // Signing in added a session and a refresh token; nothing was removed.
        expect(after[table]).toBeGreaterThanOrEqual(before[table]);
      }
      const gone = Object.entries(after).filter(
        ([table, rows]) =>
          !KEPT.includes(table) && table !== 'category' && rows > 0,
      );
      expect(gone).toEqual([]);
      expect(ownedBy(db, 'u2')).toEqual(otherBefore);
      expect(ownedBy(db, 'g1')).toEqual(googleBefore);
      expect(
        db.tables().category.find((c) => c.id === 'global-cat'),
      ).toBeDefined();

      // Still signed in, with the same session: renewing it works, and so does a fresh login.
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(201);
      await login('u1@example.com').expect(201);
    });

    it('gives the starter categories back in place of the old ones, and unsets the main account', async () => {
      await resetData(tokenFor('u1')).expect(204);

      const mine = db.tables().category.filter((c) => c.userId === 'u1');
      expect(mine.map((c) => c.name).sort()).toEqual(
        DEFAULT_CATEGORIES.map((c) => c.name).sort(),
      );
      expect(mine.find((c) => c.id === 'u1-cat')).toBeUndefined();
      expect(db.tables().user.find((u) => u.id === 'u1')?.settings).toEqual({
        defaultCurrency: 'EUR',
      });
      // Nothing left points at a deleted row of theirs.
      const rest = JSON.stringify(
        Object.entries(db.tables()).filter(
          ([table]) => !['user', 'category'].includes(table),
        ),
      );
      expect(rest).not.toMatch(/u1-(cash|bank|cat|tx|root|goal|draft|budget)/);
    });

    it('works for a Google-only account, and can run twice', async () => {
      await resetData(tokenFor('g1')).expect(204);
      await resetData(tokenFor('g1')).expect(204);
      expect(ownedBy(db, 'g1').account).toBe(0);
      expect(ownedBy(db, 'g1').user).toBe(1);
      expect(ownedBy(db, 'g1').oAuthGrant).toBe(1);
    });

    it('rolls back everything if any step fails', async () => {
      const before = structuredClone(db.tables());
      const analyticsCache = (
        db as unknown as Record<string, { deleteMany: () => Promise<unknown> }>
      ).analyticsCache;
      analyticsCache.deleteMany = async () => {
        throw new Error('connection lost');
      };

      await resetData(tokenFor('u1')).expect(500);

      expect(db.tables()).toEqual(before);
    });
  });
});
