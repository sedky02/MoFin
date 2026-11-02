/**
 * Changing the password and signing out everywhere, through the real
 * controller, guards (global throttler + web JWT, the per-user change limit),
 * validation and AuthService.
 *
 * Prisma is replaced by in-memory User, RefreshToken and PasswordResetToken
 * tables, so it needs no database and runs with a plain
 * `npm run test:e2e -- sessions`. Sessions are real: they come from
 * POST /auth/login and are checked with POST /auth/refresh.
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
import { CHANGE_PASSWORD_THROTTLE } from '../src/common/guards/auth-throttler.guard';
import { GlobalJwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrismaService } from '../src/database/prisma.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import {
  AuthService,
  GOOGLE_ONLY_PASSWORD_MESSAGE,
} from '../src/modules/auth/auth.service';
import { GoogleIdTokenVerifier } from '../src/modules/auth/id-token-verifier.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { UsersService } from '../src/modules/users/users.service';

const ENV = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  REFRESH_TOKEN_SECRET: 'test-refresh-token-secret-of-32-chars',
  OAUTH_ISSUER: 'http://localhost:3000',
};

type Row = Record<string, unknown> & { id: string };

/** Just enough of Prisma's API over arrays for AuthService and UsersService. */
function inMemoryPrisma() {
  const tables: Record<'user' | 'refreshToken' | 'passwordResetToken', Row[]> =
    {
      user: [],
      refreshToken: [],
      passwordResetToken: [],
    };
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && 'not' in value)
        return row[key] !== (value as { not: unknown }).not;
      return row[key] === value;
    });
  const delegate = (rows: Row[]) => ({
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: Row = {
        id: `row-${rows.length + 1}`,
        revokedAt: null,
        rotatedToId: null,
        ...data,
      };
      rows.push(row);
      return { ...row };
    },
    update: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const row = rows.find((r) => matches(r, where));
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
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
  });
  const prisma = {
    tables,
    user: delegate(tables.user),
    refreshToken: delegate(tables.refreshToken),
    passwordResetToken: delegate(tables.passwordResetToken),
    $transaction: async (run: (tx: unknown) => unknown) => run(prisma),
  };
  return prisma;
}

describe('Password change and sign-out everywhere (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: ReturnType<typeof inMemoryPrisma>;
  let ipCounter = 0;

  // A distinct client IP per login, so the per-email+IP login limit never
  // gets in the way of setting up several sessions.
  const nextIp = () => `10.30.0.${++ipCounter}`;

  beforeEach(async () => {
    prisma = inMemoryPrisma();
    const passwordHash = await bcrypt.hash('old-password', 4);
    prisma.tables.user.push(
      { id: 'u1', email: 'one@example.com', passwordHash, googleId: null },
      { id: 'u2', email: 'two@example.com', passwordHash, googleId: null },
      {
        id: 'g1',
        email: 'google@example.com',
        passwordHash: null,
        googleId: 'google-sub',
      },
    );

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [AuthController],
      providers: [
        // Same order as AppModule.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: GlobalJwtAuthGuard },
        { provide: ConfigService, useValue: new ConfigService(ENV) },
        { provide: JwtService, useValue: new JwtService() },
        { provide: PrismaService, useValue: prisma },
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

  async function login(email: string, password = 'old-password') {
    const res = await http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password })
      .expect(201);
    return res.body as { accessToken: string; refreshToken: string };
  }

  const refresh = (refreshToken: string) =>
    http().post('/api/v1/auth/refresh').send({ refreshToken });

  const changePassword = (
    accessToken: string,
    body: object,
    ip = '203.0.113.7',
  ) =>
    http()
      .post('/api/v1/auth/password/change')
      .set('X-Forwarded-For', ip)
      .auth(accessToken, { type: 'bearer' })
      .send(body);

  describe('POST /auth/password/change', () => {
    it('needs a web session', async () => {
      await http()
        .post('/api/v1/auth/password/change')
        .send({ currentPassword: 'old-password', newPassword: 'new-password' })
        .expect(401);
    });

    it('answers a wrong current password with 400 and a field error, not 401, and keeps every session', async () => {
      const laptop = await login('one@example.com');
      const current = await login('one@example.com');

      const res = await changePassword(current.accessToken, {
        currentPassword: 'not-it',
        newPassword: 'new-password',
        refreshToken: current.refreshToken,
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([
        { path: 'currentPassword', message: expect.any(String) },
      ]);
      await refresh(laptop.refreshToken).expect(201);
      await login('one@example.com', 'old-password');
    });

    it('applies the register/reset password rule to the new password', async () => {
      const current = await login('one@example.com');

      const res = await changePassword(current.accessToken, {
        currentPassword: 'old-password',
        newPassword: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ path: 'newPassword' }),
      ]);
    });

    it("changes the password, signs out the other sessions and keeps the caller's", async () => {
      const laptop = await login('one@example.com');
      const phone = await login('one@example.com');
      const current = await login('one@example.com');
      const otherUser = await login('two@example.com');

      const res = await changePassword(current.accessToken, {
        currentPassword: 'old-password',
        newPassword: 'new-password',
        refreshToken: current.refreshToken,
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Password changed.' });
      await refresh(laptop.refreshToken).expect(401);
      await refresh(phone.refreshToken).expect(401);
      const rotated = await refresh(current.refreshToken).expect(201);
      await refresh(rotated.body.refreshToken).expect(201);
      await refresh(otherUser.refreshToken).expect(201);

      // The new password is the one that signs in now.
      await http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', nextIp())
        .send({ email: 'one@example.com', password: 'old-password' })
        .expect(401);
      await login('one@example.com', 'new-password');
    });

    it('tells a Google-only account it has no password to change', async () => {
      const token = new JwtService().sign(
        { sub: 'g1', email: 'google@example.com' },
        {
          secret: ENV.JWT_ACCESS_SECRET,
          issuer: ENV.OAUTH_ISSUER,
          audience: 'mofin-web',
        },
      );

      const res = await changePassword(token, {
        currentPassword: 'anything',
        newPassword: 'new-password',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(GOOGLE_ONLY_PASSWORD_MESSAGE);
    });

    it('limits attempts per user, across IPs, with Retry-After', async () => {
      const one = await login('one@example.com');
      const two = await login('two@example.com');
      const wrong = { currentPassword: 'guess', newPassword: 'new-password' };

      for (let i = 0; i < CHANGE_PASSWORD_THROTTLE.limit; i++) {
        await changePassword(
          one.accessToken,
          wrong,
          `198.51.100.${i + 1}`,
        ).expect(400);
      }
      const res = await changePassword(one.accessToken, wrong, '198.51.100.99');
      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

      // Another user is unaffected.
      await changePassword(two.accessToken, wrong).expect(400);
    });
  });

  describe('POST /auth/sessions/revoke-all', () => {
    it('needs a web session', async () => {
      await http().post('/api/v1/auth/sessions/revoke-all').expect(401);
    });

    it("revokes every refresh token of the user, the caller's included", async () => {
      const laptop = await login('one@example.com');
      const current = await login('one@example.com');
      const rotated = (await refresh(laptop.refreshToken).expect(201)).body as {
        refreshToken: string;
      };
      const otherUser = await login('two@example.com');

      await http()
        .post('/api/v1/auth/sessions/revoke-all')
        .auth(current.accessToken, { type: 'bearer' })
        .expect(204);

      await refresh(current.refreshToken).expect(401);
      await refresh(rotated.refreshToken).expect(401);
      // Already rotated before the revocation: replaying it stays refused too.
      await refresh(laptop.refreshToken).expect(401);
      await refresh(otherUser.refreshToken).expect(201);
    });
  });
});
