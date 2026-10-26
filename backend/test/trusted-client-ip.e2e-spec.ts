/**
 * Rate limits keyed on the client IP the BFF vouches for (B-103).
 *
 * Deployed, every request reaches the backend from the BFF's egress IP, so
 * this suite sends one fixed X-Forwarded-For for every request (what
 * `trust proxy 1` resolves to behind the edge) and varies only the
 * `x-mofin-client-ip` header the BFF adds. Same wiring as auth-throttle (the
 * global ThrottlerGuard plus the routes' own guards, stub services, no
 * database), with the middleware registered the way main.ts does it.
 */
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AUTH_THROTTLE } from '../src/common/guards/auth-throttler.guard';
import {
  BFF_SECRET_HEADER,
  CLIENT_IP_HEADER,
  trustedClientIpMiddleware,
} from '../src/common/middleware/trusted-client-ip.middleware';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';

const GLOBAL_LIMIT = 300;
const SECRET = 'k'.repeat(48);
const BFF_IP = '192.0.2.10';

describe('Trusted client IP from the BFF (e2e)', () => {
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

  async function start(configuredSecret: string | undefined) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: GLOBAL_LIMIT }]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: AuthService, useValue: authService },
        { provide: PasswordResetService, useValue: passwordResetService },
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    nestApp.set('trust proxy', 1);
    nestApp.use(trustedClientIpMiddleware(configuredSecret));
    nestApp.setGlobalPrefix('api/v1');
    await nestApp.init();
    app = nestApp as unknown as INestApplication<App>;
  }

  afterEach(async () => {
    await app?.close();
  });

  const login = (email: string, clientIp: string, secret?: string) => {
    const req = request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', BFF_IP)
      .set(CLIENT_IP_HEADER, clientIp);
    if (secret !== undefined) void req.set(BFF_SECRET_HEADER, secret);
    return req.send({ email, password: 'whatever' });
  };

  describe('with BFF_SHARED_SECRET configured', () => {
    beforeEach(() => start(SECRET));

    it('tracks the same email from two client IPs separately', async () => {
      for (let i = 0; i < AUTH_THROTTLE.limit; i++) {
        await login('same@example.com', '203.0.113.7', SECRET).expect(201);
      }
      await login('same@example.com', '203.0.113.7', SECRET).expect(429);

      // Same BFF hop, same email, different real client: its own bucket.
      await login('same@example.com', '198.51.100.1', SECRET).expect(201);
    });

    it.each([
      ['a wrong secret', 'w'.repeat(48)],
      ['no secret', undefined],
    ])('ignores the client IP header sent with %s', async (_label, secret) => {
      for (let i = 0; i < AUTH_THROTTLE.limit; i++) {
        await login('victim@example.com', `198.51.100.${i + 1}`, secret).expect(
          201,
        );
      }
      // Rotating the claimed IP doesn't buy fresh buckets: every attempt
      // counts against the hop's own IP.
      await login('victim@example.com', '198.51.100.99', secret).expect(429);
    });

    it('applies the global baseline per trusted client IP', async () => {
      for (let i = 0; i < GLOBAL_LIMIT; i++) {
        await login(`bulk${i}@example.com`, '203.0.113.7', SECRET).expect(201);
      }
      await login('one-more@example.com', '203.0.113.7', SECRET).expect(429);

      // Another client behind the same BFF is unaffected.
      await login('one-more@example.com', '198.51.100.1', SECRET).expect(201);
    });
  });

  describe('without BFF_SHARED_SECRET configured', () => {
    beforeEach(() => start(undefined));

    it('ignores the client IP header and keys on req.ip as before', async () => {
      for (let i = 0; i < AUTH_THROTTLE.limit; i++) {
        await login('same@example.com', `198.51.100.${i + 1}`, SECRET).expect(
          201,
        );
      }
      await login('same@example.com', '198.51.100.99', SECRET).expect(429);
    });
  });
});
