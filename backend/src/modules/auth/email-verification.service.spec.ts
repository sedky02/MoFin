import { BadRequestException } from '@nestjs/common';
import { sha256 } from '../../common/utils/hash';
import { EmailVerificationService } from './email-verification.service';

const REQUIRED_FROM = new Date('2026-11-08T00:00:00Z');
const AFTER_CUTOFF = new Date('2026-11-09T00:00:00Z');
const BINDING = 'x'.repeat(43);

function makeService(overrides: { stored?: unknown; user?: unknown } = {}) {
  const tokens = {
    updateMany: jest.fn(async () => ({ count: 1 })),
    create: jest.fn(async () => ({})),
    findUnique: jest.fn(async () => overrides.stored ?? null),
  };
  const prisma: Record<string, unknown> = {
    emailVerificationToken: tokens,
    user: {
      findUnique: jest.fn(async () => overrides.user ?? null),
      findUniqueOrThrow: jest.fn(async () => ({
        email: 'a@b.com',
        emailVerifiedAt: null,
      })),
      update: jest.fn(async () => ({ id: 'u1', email: 'a@b.com' })),
    },
    $transaction: jest.fn(
      async (arg: unknown): Promise<unknown> =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as unknown[]),
    ),
  };
  const mail = { send: jest.fn(async () => undefined) };
  const config = {
    get: (key: string, fallback?: unknown) =>
      key === 'EMAIL_VERIFICATION_REQUIRED_FROM' ? REQUIRED_FROM : fallback,
  };
  const service = new EmailVerificationService(
    prisma as never,
    mail as never,
    config as never,
  );
  return { service, prisma, tokens, mail };
}

const pendingUser = {
  id: 'u1',
  email: 'a@b.com',
  emailVerifiedAt: null,
  passwordHash: 'hash',
  isDemo: false,
  createdAt: AFTER_CUTOFF,
};

describe('EmailVerificationService.isRequiredFor', () => {
  const { service } = makeService();

  it('requires it for an unverified email/password account created after the cutoff', () => {
    expect(service.isRequiredFor(pendingUser)).toBe(true);
  });

  it('exempts accounts created before the cutoff', () => {
    expect(
      service.isRequiredFor({
        ...pendingUser,
        createdAt: new Date('2026-11-01T00:00:00Z'),
      }),
    ).toBe(false);
  });

  it('exempts verified, Google-only and demo accounts', () => {
    expect(
      service.isRequiredFor({ ...pendingUser, emailVerifiedAt: new Date() }),
    ).toBe(false);
    expect(service.isRequiredFor({ ...pendingUser, passwordHash: null })).toBe(
      false,
    );
    expect(service.isRequiredFor({ ...pendingUser, isDemo: true })).toBe(false);
  });
});

describe('EmailVerificationService.sendLink', () => {
  it('stores only the hash of the browser binding', async () => {
    const { service, tokens } = makeService();

    await service.sendLink('u1', { browserBinding: BINDING, client: 'web' });

    expect(tokens.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ browserBindingHash: sha256(BINDING) }),
    });
  });

  it('marks links for app sign-ups so the web page can send people back to the app', async () => {
    const { service, mail } = makeService();

    await service.sendLink('u1', { client: 'mobile' });

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/verify-email#token=[\w-]+&from=app/),
      }),
    );
  });
});

describe('EmailVerificationService.resend', () => {
  it('sends a new link only to an account still waiting for verification', async () => {
    const pending = makeService({ user: pendingUser });
    await pending.service.resend('a@b.com', { client: 'web' });
    expect(pending.mail.send).toHaveBeenCalledTimes(1);

    const verified = makeService({
      user: { ...pendingUser, emailVerifiedAt: new Date() },
    });
    await verified.service.resend('a@b.com', { client: 'web' });
    expect(verified.mail.send).not.toHaveBeenCalled();

    const unknown = makeService({ user: null });
    await unknown.service.resend('nobody@b.com', { client: 'web' });
    expect(unknown.mail.send).not.toHaveBeenCalled();
  });
});

describe('EmailVerificationService.verify', () => {
  const validToken = (browserBindingHash: string | null) => ({
    id: 't1',
    userId: 'u1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    browserBindingHash,
  });

  it('reports the same browser when the binding cookie matches the link', async () => {
    const { service } = makeService({ stored: validToken(sha256(BINDING)) });

    await expect(service.verify('token', BINDING)).resolves.toEqual({
      userId: 'u1',
      email: 'a@b.com',
      sameBrowser: true,
    });
  });

  it('verifies without a session from any other browser', async () => {
    const { service } = makeService({ stored: validToken(sha256(BINDING)) });
    await expect(service.verify('token', 'y'.repeat(43))).resolves.toEqual(
      expect.objectContaining({ sameBrowser: false }),
    );

    const unbound = makeService({ stored: validToken(null) });
    await expect(unbound.service.verify('token', BINDING)).resolves.toEqual(
      expect.objectContaining({ sameBrowser: false }),
    );
  });

  it('rejects a used or expired link', async () => {
    const used = makeService({
      stored: { ...validToken(null), usedAt: new Date() },
    });
    await expect(used.service.verify('token')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const expired = makeService({
      stored: { ...validToken(null), expiresAt: new Date(Date.now() - 1) },
    });
    await expect(expired.service.verify('token')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
