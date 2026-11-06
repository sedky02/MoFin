/**
 * Password recovery end to end on a throwaway PostgreSQL: set E2E_DATABASE_URL (name containing
 * "test" or "e2e") or the suite is skipped. Run: npm run test:e2e -- password-reset
 */
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { sha256 } from '../src/common/utils/hash';
import { PrismaService } from '../src/database/prisma.service';
import { MailMessage, MailSender } from '../src/modules/mail/mail-sender';

const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;
const describeWithDb = E2E_DATABASE_URL ? describe : describe.skip;

class CapturingMailSender extends MailSender {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

describeWithDb('Password recovery (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = new CapturingMailSender();
  const createdEmails: string[] = [];
  const runId = Date.now().toString(36);
  let ipCounter = 0;

  // A distinct client IP per request (trust proxy is on, as in main.ts), so
  // the per-route rate limits don't interfere between test steps.
  const nextIp = () => {
    ipCounter += 1;
    return `10.20.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
  };
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('X-Forwarded-For', nextIp())
      .send(body);

  const newEmail = (label: string) => {
    const email = `b02-${runId}-${label}@mofin.test`;
    createdEmails.push(email);
    return email;
  };

  async function registerUser(email: string, password: string) {
    await post('/auth/register', { email, password }).expect(201);
  }

  async function login(email: string, password: string) {
    return post('/auth/login', { email, password });
  }

  async function waitForResetToken(to: string): Promise<string> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const message = [...mail.sent].reverse().find((m) => m.to === to);
      const match =
        message && /reset-password#token=([A-Za-z0-9_-]+)/.exec(message.text);
      if (match) {
        mail.sent.splice(mail.sent.indexOf(message), 1);
        return match[1];
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`no reset email for ${to}`);
  }

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
    process.env.WEB_URL = 'http://web.e2e';

    // Imported after the env is set: ConfigModule validates on import.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailSender)
      .useValue(mail)
      .compile();

    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    nestApp.set('trust proxy', 1);
    nestApp.setGlobalPrefix('api/v1');
    await nestApp.init();
    app = nestApp as unknown as INestApplication<App>;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma && createdEmails.length) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await app?.close();
  });

  it('forgot answers 202 with the same body and similar timing for known and unknown emails', async () => {
    const known = newEmail('known');
    await registerUser(known, 'original-pass-1');
    const unknown = `b02-${runId}-nobody@mofin.test`;

    const timings: Record<'known' | 'unknown', number[]> = {
      known: [],
      unknown: [],
    };
    const bodies: Record<'known' | 'unknown', unknown[]> = {
      known: [],
      unknown: [],
    };
    for (let i = 0; i < 5; i++) {
      for (const [kind, email] of [
        ['known', known],
        ['unknown', unknown],
      ] as const) {
        const started = performance.now();
        const res = await post('/auth/password/forgot', { email });
        timings[kind].push(performance.now() - started);
        expect(res.status).toBe(202);
        bodies[kind].push(res.body);
      }
    }

    expect(
      new Set(
        [...bodies.known, ...bodies.unknown].map((b) => JSON.stringify(b)),
      ).size,
    ).toBe(1);
    const median = (xs: number[]) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    expect(
      Math.abs(median(timings.known) - median(timings.unknown)),
    ).toBeLessThan(100);

    await waitForResetToken(known);
    expect(mail.sent.some((m) => m.to === unknown)).toBe(false);
  });

  it('stores the reset token hashed, never in plain text', async () => {
    const email = newEmail('hashed');
    await registerUser(email, 'original-pass-1');
    await post('/auth/password/forgot', { email }).expect(202);
    const token = await waitForResetToken(email);

    const rows = await prisma.passwordResetToken.findMany({
      where: { user: { email } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(sha256(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('a token works once; afterwards the old password and every old refresh token fail', async () => {
    const email = newEmail('flow');
    await registerUser(email, 'original-pass-1');
    const first = await login(email, 'original-pass-1');
    const second = await login(email, 'original-pass-1');
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    await post('/auth/password/forgot', { email }).expect(202);
    const token = await waitForResetToken(email);

    await post('/auth/password/reset', {
      token,
      password: 'brand-new-pass-2',
    }).expect(200);
    await post('/auth/password/reset', {
      token,
      password: 'another-pass-3',
    }).expect(400);

    expect((await login(email, 'original-pass-1')).status).toBe(401);
    expect((await login(email, 'another-pass-3')).status).toBe(401);
    expect((await login(email, 'brand-new-pass-2')).status).toBe(201);

    await post('/auth/refresh', {
      refreshToken: first.body.refreshToken,
    }).expect(401);
    await post('/auth/refresh', {
      refreshToken: second.body.refreshToken,
    }).expect(401);
  });

  it('rejects an expired token with 400 and leaves the password unchanged', async () => {
    const email = newEmail('expired');
    await registerUser(email, 'original-pass-1');
    await post('/auth/password/forgot', { email }).expect(202);
    const token = await waitForResetToken(email);

    await prisma.passwordResetToken.update({
      where: { tokenHash: sha256(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await post('/auth/password/reset', {
      token,
      password: 'brand-new-pass-2',
    }).expect(400);
    expect((await login(email, 'original-pass-1')).status).toBe(201);
  });

  it('rejects an unknown token and a superseded token with 400', async () => {
    await post('/auth/password/reset', {
      token: 'not-a-real-token',
      password: 'brand-new-pass-2',
    }).expect(400);

    const email = newEmail('superseded');
    await registerUser(email, 'original-pass-1');
    await post('/auth/password/forgot', { email }).expect(202);
    const older = await waitForResetToken(email);
    await post('/auth/password/forgot', { email }).expect(202);
    const newer = await waitForResetToken(email);

    await post('/auth/password/reset', {
      token: older,
      password: 'brand-new-pass-2',
    }).expect(400);
    await post('/auth/password/reset', {
      token: newer,
      password: 'brand-new-pass-2',
    }).expect(200);
  });
});
