import { BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { sha256 } from '../../common/utils/hash';
import { MailMessage } from '../mail/mail-sender';
import {
  INVALID_RESET_TOKEN_MESSAGE,
  PasswordResetService,
} from './password-reset.service';

const USER = { id: 'u1', email: 'a@b.com', passwordHash: 'old-hash' };

function makeService(
  opts: { user?: unknown; stored?: unknown; claimCount?: number } = {},
) {
  const sent: MailMessage[] = [];
  const passwordResetToken = {
    create: jest.fn((args: unknown) => args),
    updateMany: jest.fn(async (args: { where: { id?: string } }) => ({
      count: args.where.id ? (opts.claimCount ?? 1) : 0,
    })),
    findUnique: jest.fn(async () => opts.stored ?? null),
  };
  const tx = {
    passwordResetToken,
    user: { update: jest.fn(async () => ({})) },
    refreshToken: { updateMany: jest.fn(async () => ({ count: 2 })) },
  };
  const prisma = {
    passwordResetToken,
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? arg(tx) : Promise.all(arg as unknown[]),
    ),
  };
  const usersService = {
    findByEmail: jest.fn(async () =>
      opts.user === undefined ? USER : opts.user,
    ),
  };
  const mail = { send: jest.fn(async (m: MailMessage) => void sent.push(m)) };
  const config = {
    get: (key: string, fallback?: string) =>
      (
        ({ WEB_URL: 'http://web.test/', PASSWORD_RESET_TTL: '30m' }) as Record<
          string,
          string
        >
      )[key] ?? fallback,
  };
  const service = new PasswordResetService(
    prisma as never,
    usersService as never,
    mail,
    config as never,
  );
  return { service, prisma, tx, mail, sent, passwordResetToken };
}

function tokenFromLink(text: string): string {
  const match = /reset-password#token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match) throw new Error('no reset link in email');
  return match[1];
}

describe('PasswordResetService.requestReset', () => {
  it('does nothing for an unknown email: no token row, no email', async () => {
    const { service, prisma, mail } = makeService({ user: null });
    await service.requestReset('nobody@example.com');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('stores only the SHA-256 of the token, never the token itself', async () => {
    const { service, passwordResetToken, sent } = makeService();
    await service.requestReset('a@b.com');

    const token = tokenFromLink(sent[0].text);
    const { data } = passwordResetToken.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.tokenHash).toBe(sha256(token));
    expect(data.tokenHash).not.toBe(token);
    // The raw token appears in no stored field.
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it('uses 32 random bytes per token, different on each request', async () => {
    const { service, sent } = makeService();
    await service.requestReset('a@b.com');
    await service.requestReset('a@b.com');
    const [first, second] = sent.map((m) => tokenFromLink(m.text));
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(first).not.toBe(second);
  });

  it('sets the expiry from PASSWORD_RESET_TTL (30 minutes)', async () => {
    const { service, passwordResetToken } = makeService();
    const before = Date.now();
    await service.requestReset('a@b.com');
    const { data } = passwordResetToken.create.mock.calls[0][0] as {
      data: { expiresAt: Date };
    };
    const ttl = data.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(30 * 60_000 - 1000);
    expect(ttl).toBeLessThanOrEqual(30 * 60_000 + 1000);
  });

  it('supersedes outstanding links for the user before issuing a new one', async () => {
    const { service, passwordResetToken } = makeService();
    await service.requestReset('a@b.com');
    expect(passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('emails a web reset link with the token in the URL fragment', async () => {
    const { service, sent } = makeService();
    await service.requestReset('a@b.com');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('a@b.com');
    expect(sent[0].text).toMatch(
      /^http:\/\/web\.test\/reset-password#token=[A-Za-z0-9_-]{43}$/m,
    );
    expect(sent[0].text).toContain('30 minutes');
  });
});

describe('PasswordResetService.requestResetInBackground', () => {
  afterEach(() => jest.restoreAllMocks());

  it('swallows and logs failures so the caller always answers 202', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, mail } = makeService();
    mail.send.mockRejectedValueOnce(new Error('smtp down'));

    expect(() => service.requestResetInBackground('a@b.com')).not.toThrow();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('smtp down'));
  });
});

describe('PasswordResetService.resetPassword', () => {
  const FUTURE = new Date(Date.now() + 10 * 60_000);
  const valid = {
    id: 't1',
    userId: 'u1',
    tokenHash: sha256('tok'),
    usedAt: null,
    expiresAt: FUTURE,
  };

  it('looks the token up by its hash', async () => {
    const { service, passwordResetToken } = makeService({ stored: valid });
    await service.resetPassword('tok', 'new-password-1');
    expect(passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256('tok') },
    });
  });

  it('rejects an unknown token with 400', async () => {
    const { service } = makeService({ stored: null });
    await expect(
      service.resetPassword('nope', 'new-password-1'),
    ).rejects.toThrow(new BadRequestException(INVALID_RESET_TOKEN_MESSAGE));
  });

  it('rejects an already used token with 400', async () => {
    const { service, tx } = makeService({
      stored: { ...valid, usedAt: new Date() },
    });
    await expect(
      service.resetPassword('tok', 'new-password-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects an expired token with 400', async () => {
    const { service, tx } = makeService({
      stored: { ...valid, expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      service.resetPassword('tok', 'new-password-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects when a concurrent redemption claimed the token first', async () => {
    const { service, tx } = makeService({ stored: valid, claimCount: 0 });
    await expect(
      service.resetPassword('tok', 'new-password-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('sets a bcrypt hash of the new password, marks the token used and revokes every refresh token', async () => {
    const { service, tx, passwordResetToken } = makeService({ stored: valid });

    await service.resetPassword('tok', 'new-password-1');

    expect(passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { usedAt: expect.any(Date) },
    });
    const { data } = (
      tx.user.update.mock.calls[0] as unknown as [
        { data: { passwordHash: string } },
      ]
    )[0];
    expect(await bcrypt.compare('new-password-1', data.passwordHash)).toBe(
      true,
    );
    expect(data.passwordHash).not.toContain('new-password-1');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
