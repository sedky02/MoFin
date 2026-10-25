/**
 * Rate limiting on POST /auth/refresh, through the real guards and HTTP stack.
 *
 * Wires AuthController with the same throttler setup as AppModule (global
 * ThrottlerGuard at 300/min plus the route's own guard) and a stub
 * AuthService, so it needs no database and runs with a plain
 * `npm run test:e2e -- refresh-throttle`.
 */
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { REFRESH_THROTTLE } from '../src/common/guards/refresh-throttler.guard';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';

describe('POST /auth/refresh rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  const authService = {
    refreshTokens: jest.fn(async (token: string) => ({
      accessToken: `a-${token}`,
      refreshToken: `r-${token}`,
    })),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: AuthService, useValue: authService },
        { provide: PasswordResetService, useValue: {} },
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

  const refresh = (refreshToken: string, ip = '203.0.113.7') =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Forwarded-For', ip)
      .send({ refreshToken });

  it('does not throttle 10 refreshes from one IP with different tokens together', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await refresh(`token-${i}`);
      expect(res.status).toBe(201);
    }
  });

  it('throttles one token replayed past the per-token limit, with Retry-After', async () => {
    for (let i = 0; i < REFRESH_THROTTLE.limit; i++) {
      await refresh('same-token').expect(201);
    }
    const res = await refresh('same-token');
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

    // Another token from the same IP is unaffected.
    await refresh('other-token').expect(201);
  });

  it('counts a replayed token across IPs', async () => {
    for (let i = 0; i < REFRESH_THROTTLE.limit; i++) {
      await refresh('roaming-token', `198.51.100.${i + 1}`).expect(201);
    }
    await refresh('roaming-token', '198.51.100.99').expect(429);
  });
});
