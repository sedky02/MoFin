/**
 * Native Google sign-in from the mobile app (POST /auth/google/id-token),
 * through the real controller, guards (global throttler + web JWT, the
 * per-client credential limit), validation, GoogleIdTokenVerifier,
 * AuthService and UsersService.
 *
 * Only Google's published keys are swapped: the verifier gets a local JWKS
 * whose private key the test holds, so it can sign real RS256 ID tokens.
 * The first suite uses the in-memory database from support/in-memory-prisma.ts,
 * so it needs no database and runs with `npm run test:e2e -- google-id-token`.
 *
 * The second runs the whole AppModule against a real (throwaway) PostgreSQL,
 * set up as described in password-reset.e2e-spec.ts, and is skipped unless
 * E2E_DATABASE_URL is set:
 *
 *   E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mofin_e2e npm run test:e2e -- google-id-token
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type KeyLike,
  type JWTPayload,
} from 'jose';
import * as request from 'supertest';
import { App } from 'supertest/types';
import {
  AUTH_THROTTLE,
  GOOGLE_ID_TOKEN_THROTTLE,
} from '../src/common/guards/auth-throttler.guard';
import { GlobalJwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrismaService } from '../src/database/prisma.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import {
  GOOGLE_ID_TOKEN_KEYS,
  GoogleIdTokenVerifier,
  INVALID_ID_TOKEN_MESSAGE,
} from '../src/modules/auth/id-token-verifier.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { UsersService } from '../src/modules/users/users.service';
import { Db, inMemoryPrisma } from './support/in-memory-prisma';

const WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;
const describeWithDb = E2E_DATABASE_URL ? describe : describe.skip;

/** A local stand-in for Google: its JWKS and a signer for RS256 ID tokens. */
async function fakeGoogle() {
  const pair = await generateKeyPair('RS256');
  const attackerKey = (await generateKeyPair('RS256')).privateKey;
  const jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'g1', alg: 'RS256' }],
  });
  const idToken = (claims: JWTPayload = {}, key = pair.privateKey) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      iss: 'https://accounts.google.com',
      aud: WEB_CLIENT_ID,
      azp: 'android-client.apps.googleusercontent.com',
      sub: 'google-sub-1',
      iat: now,
      exp: now + 3600,
      email: 'jane@example.com',
      email_verified: true,
      name: 'Jane',
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'g1', typ: 'JWT' })
      .sign(key);
  };
  return { jwks, attackerKey, idToken };
}
const ENV = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  REFRESH_TOKEN_SECRET: 'test-refresh-token-secret-of-32-chars',
  OAUTH_ISSUER: 'http://localhost:3000',
  GOOGLE_MOBILE_CLIENT_IDS: `ios-client.apps.googleusercontent.com, ${WEB_CLIENT_ID}`,
};

describe('POST /auth/google/id-token (e2e)', () => {
  let app: INestApplication<App>;
  let db: Db;
  let google: Awaited<ReturnType<typeof fakeGoogle>>;
  let ipCounter = 0;
  const nextIp = () => `10.50.0.${++ipCounter}`;
  const idToken = (claims?: JWTPayload, key?: KeyLike) =>
    google.idToken(claims, key);

  beforeAll(async () => {
    google = await fakeGoogle();
  });

  async function startApp(env: Record<string, string>) {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [AuthController],
      providers: [
        // Same order as AppModule.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: GlobalJwtAuthGuard },
        { provide: ConfigService, useValue: new ConfigService(env) },
        { provide: JwtService, useValue: new JwtService() },
        { provide: PrismaService, useValue: db },
        { provide: PasswordResetService, useValue: {} },
        { provide: GOOGLE_ID_TOKEN_KEYS, useValue: google.jwks },
        GoogleIdTokenVerifier,
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
  }

  beforeEach(async () => {
    db = inMemoryPrisma();
    await startApp(ENV);
  });

  afterEach(async () => {
    await app?.close();
  });

  const signIn = (token: string, ip = nextIp()) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/google/id-token')
      .set('X-Forwarded-For', ip)
      .send({ idToken: token });

  it('creates the user and answers with the same token pair as email login', async () => {
    db.tables().user.push({
      id: 'pw-user',
      email: 'pw@example.com',
      passwordHash: await bcrypt.hash('right-password', 4),
      googleId: null,
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'pw@example.com', password: 'right-password' })
      .expect(201);

    const res = await signIn(await idToken()).expect(201);

    expect(Object.keys(res.body).sort()).toEqual(
      Object.keys(login.body).sort(),
    );
    expect(res.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    const created = db
      .tables()
      .user.filter((u) => u.email === 'jane@example.com');
    expect(created).toEqual([
      expect.objectContaining({
        googleId: 'google-sub-1',
        displayName: 'Jane',
      }),
    ]);
    expect(created[0].passwordHash ?? null).toBeNull();

    // The pair is a real session: /auth/me with the access token, and the
    // refresh token rotates.
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      id: created[0].id,
      email: 'jane@example.com',
    });
    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: res.body.refreshToken })
      .expect(201);
    expect(refreshed.body.refreshToken).not.toBe(res.body.refreshToken);
  });

  it('links an existing email account and keeps signing the same sub into it', async () => {
    db.tables().user.push({
      id: 'existing',
      email: 'jane@example.com',
      passwordHash: 'hash',
      googleId: null,
    });

    await signIn(await idToken()).expect(201);
    await signIn(await idToken()).expect(201);

    expect(db.tables().user).toEqual([
      expect.objectContaining({ id: 'existing', googleId: 'google-sub-1' }),
    ]);
    expect(db.tables().refreshToken).toHaveLength(2);
    expect(db.tables().refreshToken.every((t) => t.userId === 'existing')).toBe(
      true,
    );
  });

  it('answers 401 to a forged token and creates nothing', async () => {
    const forged = [
      await idToken({}, google.attackerKey), // right kid, wrong signature
      await idToken({ aud: 'someone-elses-client' }),
      await idToken({ email_verified: false }),
    ];
    for (const token of forged) {
      const res = await signIn(token).expect(401);
      expect(res.body.message).toBe(INVALID_ID_TOKEN_MESSAGE);
    }
    expect(db.tables().user).toHaveLength(0);
    expect(db.tables().refreshToken).toHaveLength(0);
  });

  it('rejects a body without an idToken with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/google/id-token')
      .set('X-Forwarded-For', nextIp())
      .send({ code: 'x' })
      .expect(400);
  });

  it('rejects a body with any field besides idToken with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/google/id-token')
      .set('X-Forwarded-For', nextIp())
      .send({ idToken: await idToken(), email: 'random@example.com' })
      .expect(400);
    expect(res.body.message).toBe('Validation failed');
    expect(db.tables().user).toHaveLength(0);
  });

  describe(`per-IP limit (${GOOGLE_ID_TOKEN_THROTTLE.limit}/min)`, () => {
    it('lets 30 anonymous sign-ins from one IP through and answers 429 to the 31st', async () => {
      expect(GOOGLE_ID_TOKEN_THROTTLE.limit).toBe(30);
      const ip = nextIp();
      // Thirty different people behind one carrier-NAT address, no
      // Authorization header on any of them.
      for (let i = 0; i < GOOGLE_ID_TOKEN_THROTTLE.limit; i++) {
        await signIn(
          await idToken({ sub: `nat-${i}`, email: `nat${i}@example.com` }),
          ip,
        ).expect(201);
      }
      const res = await signIn(
        await idToken({ sub: 'nat-31', email: 'nat31@example.com' }),
        ip,
      );
      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(db.tables().user).toHaveLength(GOOGLE_ID_TOKEN_THROTTLE.limit);

      // Another IP is unaffected.
      await signIn(
        await idToken({ sub: 'nat-31', email: 'nat31@example.com' }),
        nextIp(),
      ).expect(201);
    });

    it('counts forged tokens too, so they cannot be tried in bulk', async () => {
      const ip = nextIp();
      const forged = await idToken({}, google.attackerKey);
      for (let i = 0; i < GOOGLE_ID_TOKEN_THROTTLE.limit; i++)
        await signIn(forged, ip).expect(401);
      // Even a valid token is refused once the limit is hit.
      await signIn(await idToken(), ip).expect(429);
      expect(db.tables().user).toHaveLength(0);
    });

    it('gives no fresh bucket to a body with a random email field', async () => {
      const ip = nextIp();
      const forged = await idToken({}, google.attackerKey);
      // Each request carries a different email: under the old email+IP key
      // each would have had a bucket of its own. Now they are all 400s and
      // all count against the one per-IP bucket.
      for (let i = 0; i < GOOGLE_ID_TOKEN_THROTTLE.limit; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/google/id-token')
          .set('X-Forwarded-For', ip)
          .send({ idToken: forged, email: `random-${i}@example.com` })
          .expect(400);
      }
      await request(app.getHttpServer())
        .post('/api/v1/auth/google/id-token')
        .set('X-Forwarded-For', ip)
        .send({ idToken: forged, email: 'random-last@example.com' })
        .expect(429);
      await signIn(await idToken(), ip).expect(429);
      expect(db.tables().user).toHaveLength(0);
    });

    it('leaves the login limit on the same IP as it was', async () => {
      const ip = nextIp();
      for (let i = 0; i < GOOGLE_ID_TOKEN_THROTTLE.limit; i++)
        await signIn(await idToken(), ip).expect(201);
      await signIn(await idToken(), ip).expect(429);

      // Login keeps its own AUTH_THROTTLE per email + IP: still open after
      // the Google bucket is full, and still closes after its own limit.
      const login = () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ email: 'nobody@example.com', password: 'wrong-password' });
      for (let i = 0; i < AUTH_THROTTLE.limit; i++) await login().expect(401);
      await login().expect(429);
    });
  });

  it('answers 503 when GOOGLE_MOBILE_CLIENT_IDS is not set', async () => {
    await app.close();
    const { GOOGLE_MOBILE_CLIENT_IDS: _unset, ...rest } = ENV;
    await startApp(rest);

    await signIn(await idToken()).expect(503);
    expect(db.tables().user).toHaveLength(0);
  });
});

describeWithDb('POST /auth/google/id-token against PostgreSQL (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let google: Awaited<ReturnType<typeof fakeGoogle>>;
  const runId = Date.now().toString(36);
  const emailOf = (label: string) => `g3-${runId}-${label}@mofin.test`;
  let ipCounter = 0;
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('X-Forwarded-For', `10.60.0.${++ipCounter}`)
      .send(body);
  const usersWith = (email: string) =>
    prisma.user.findMany({ where: { email } });

  beforeAll(async () => {
    const dbName = new URL(E2E_DATABASE_URL as string).pathname.replace(
      /^\//,
      '',
    );
    if (!/test|e2e/i.test(dbName)) {
      throw new Error(
        `Refusing to run against "${dbName}": use a throwaway database whose name contains "test" or "e2e".`,
      );
    }
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    process.env.JWT_ACCESS_SECRET ??= `e2e-access-${'a'.repeat(32)}`;
    process.env.JWT_MCP_SECRET ??= `e2e-mcp-${'b'.repeat(32)}`;
    process.env.REFRESH_TOKEN_SECRET ??= `e2e-refresh-${'c'.repeat(32)}`;
    process.env.GOOGLE_MOBILE_CLIENT_IDS = WEB_CLIENT_ID;
    google = await fakeGoogle();

    // Imported after the env is set: ConfigModule validates on import.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_ID_TOKEN_KEYS)
      .useValue(google.jwks)
      .compile();

    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    nestApp.set('trust proxy', 1);
    nestApp.setGlobalPrefix('api/v1');
    await nestApp.init();
    app = nestApp as unknown as INestApplication<App>;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({
      where: { email: { startsWith: `g3-${runId}-` } },
    });
    await app?.close();
  });

  it('answers 401 to a forged token and creates no user', async () => {
    const email = emailOf('forged');
    const res = await post('/auth/google/id-token', {
      idToken: await google.idToken(
        { sub: `forged-${runId}`, email },
        google.attackerKey,
      ),
    }).expect(401);

    expect(res.body.message).toBe(INVALID_ID_TOKEN_MESSAGE);
    expect(await usersWith(email)).toHaveLength(0);
  });

  it('creates exactly one user for a new account, and its refresh token works', async () => {
    const email = emailOf('new');
    const idToken = await google.idToken({ sub: `new-${runId}`, email });

    const first = await post('/auth/google/id-token', { idToken }).expect(201);
    await post('/auth/google/id-token', { idToken }).expect(201);

    const users = await usersWith(email);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      googleId: `new-${runId}`,
      passwordHash: null,
    });

    const refreshed = await post('/auth/refresh', {
      refreshToken: first.body.refreshToken,
    }).expect(201);
    expect(refreshed.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
  });

  it('links an existing password account by email instead of creating one', async () => {
    const email = emailOf('linked');
    await post('/auth/register', {
      email,
      password: 'original-pass-1',
    }).expect(201);

    const res = await post('/auth/google/id-token', {
      idToken: await google.idToken({ sub: `linked-${runId}`, email }),
    }).expect(201);

    const users = await usersWith(email);
    expect(users).toHaveLength(1);
    expect(users[0].googleId).toBe(`linked-${runId}`);
    expect(users[0].passwordHash).not.toBeNull();
    await post('/auth/refresh', {
      refreshToken: res.body.refreshToken,
    }).expect(201);
  });
});
