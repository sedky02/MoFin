/**
 * Rate limiting on the credential routes through the real guards and HTTP stack; AuthController is
 * wired with AppModule's throttler setup and stub services, so no database.
 */
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { App } from 'supertest/types';
import {
  AUTH_THROTTLE,
  FORGOT_PASSWORD_IP_THROTTLE,
  FORGOT_PASSWORD_THROTTLE,
} from '../src/common/guards/auth-throttler.guard';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { GoogleIdTokenVerifier } from '../src/modules/auth/id-token-verifier.service';
import { EmailVerificationService } from '../src/modules/auth/email-verification.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';

const GLOBAL_LIMIT = 300;

describe('Credential route rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  const tokens = { accessToken: 'a', refreshToken: 'r' };
  const authService = {
    register: jest.fn(async () => tokens),
    login: jest.fn(async () => tokens),
  };
  const passwordResetService = {
    requestResetInBackground: jest.fn(),
    resetPassword: jest.fn(async () => ({ message: 'ok' })),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: GLOBAL_LIMIT }]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: AuthService, useValue: authService },
        { provide: PasswordResetService, useValue: passwordResetService },
        { provide: EmailVerificationService, useValue: {} },
        { provide: GoogleIdTokenVerifier, useValue: {} },
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

  const post = (path: string, body: object, ip = '203.0.113.7') =>
    request(app.getHttpServer())
      .post(`/api/v1/auth/${path}`)
      .set('X-Forwarded-For', ip)
      .send(body);

  describe.each([
    {
      path: 'login',
      ok: 201,
      limit: AUTH_THROTTLE.limit,
      body: (email: string) => ({ email, password: 'whatever' }),
    },
    {
      path: 'register',
      ok: 201,
      limit: AUTH_THROTTLE.limit,
      body: (email: string) => ({ email, password: 'long-enough' }),
    },
    {
      path: 'password/forgot',
      ok: 202,
      limit: FORGOT_PASSWORD_THROTTLE.limit,
      body: (email: string) => ({ email }),
    },
  ])('POST /auth/$path', ({ path, ok, limit, body }) => {
    it('does not throttle 10 requests for 10 different emails from one IP', async () => {
      for (let i = 0; i < 10; i++) {
        await post(path, body(`user${i}@example.com`)).expect(ok);
      }
    });

    it('throttles the same email + IP past the limit, with Retry-After', async () => {
      for (let i = 0; i < limit; i++) {
        await post(path, body('same@example.com')).expect(ok);
      }
      const res = await post(path, body('same@example.com'));
      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

      // Another email from the same IP, and the same email from another IP, are unaffected.
      await post(path, body('other@example.com')).expect(ok);
      await post(path, body('same@example.com'), '198.51.100.1').expect(ok);
    });

    it('treats differently cased / padded spellings of one email as the same bucket', async () => {
      for (let i = 0; i < limit; i++) {
        await post(
          path,
          body(i % 2 ? 'Case@Example.com' : ' case@example.com '),
        ).expect(ok);
      }
      await post(path, body('CASE@EXAMPLE.COM')).expect(429);
    });
  });

  // Reset takes a token, not an email, so it's keyed on (a hash of) the token.
  describe('POST /auth/password/reset', () => {
    const reset = (token: string, ip?: string) =>
      post('password/reset', { token, password: 'new-password' }, ip);

    it('does not throttle 10 resets with different tokens from one IP', async () => {
      for (let i = 0; i < 10; i++) {
        await reset(`token-${i}`).expect(200);
      }
    });

    it('throttles one token replayed past the limit, with Retry-After', async () => {
      for (let i = 0; i < AUTH_THROTTLE.limit; i++) {
        await reset('same-token').expect(200);
      }
      const res = await reset('same-token');
      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

      await reset('other-token').expect(200);
    });

    it('counts a replayed token across IPs', async () => {
      for (let i = 0; i < AUTH_THROTTLE.limit; i++) {
        await reset('roaming-token', `198.51.100.${i + 1}`).expect(200);
      }
      await reset('roaming-token', '198.51.100.99').expect(429);
    });
  });

  it('keeps the global per-IP baseline as a backstop', async () => {
    for (let i = 0; i < GLOBAL_LIMIT; i++) {
      await post('login', {
        email: `bulk${i}@example.com`,
        password: 'x',
      }).expect(201);
    }
    await post('login', {
      email: 'one-more@example.com',
      password: 'x',
    }).expect(429);
  });

  it('caps password/forgot per IP across different emails, with Retry-After', async () => {
    for (let i = 0; i < FORGOT_PASSWORD_IP_THROTTLE.limit; i++) {
      await post('password/forgot', { email: `user${i}@example.test` }).expect(
        202,
      );
    }
    const res = await post('password/forgot', {
      email: 'one-more@example.test',
    });
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

    await post(
      'password/forgot',
      { email: 'one-more@example.test' },
      '198.51.100.20',
    ).expect(202);
  });
});
