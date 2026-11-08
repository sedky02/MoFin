import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { demoEmail } from '../../common/utils/demo-identity';
import { sha256 } from '../../common/utils/hash';
import { OAuthService } from '../oauth/oauth.service';
import { AuthService, demoHasEnded } from './auth.service';
import { registerSchema } from './dto/auth.dto';

// Stands in for EmailVerificationService where verification is not under test.
const NO_EMAIL_VERIFICATION = {
  isRequiredFor: () => false,
  runInBackground: () => undefined,
  sendLink: async () => ({ alreadyVerified: false }),
  sendAccountExistsNotice: async () => undefined,
};

const config = {
  getOrThrow: (key: string) =>
    key === 'OAUTH_ISSUER' ? 'http://localhost:3000' : `${key}-secret`,
  get: (_key: string, fallback?: string) => fallback,
};

function makeAuth(user: unknown) {
  const stored = {
    id: 'rt1',
    userId: 'demo-user',
    familyId: 'fam1',
    revokedAt: null,
    rotatedToId: null,
    expiresAt: new Date(Date.now() + 60_000),
  };
  const prisma = {
    refreshToken: {
      findUnique: jest.fn(async () => ({ ...stored, user })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async () => ({})),
    },
    user: { findUnique: jest.fn(async () => user) },
    $transaction: jest.fn(
      async (run: (tx: unknown) => unknown): Promise<unknown> => run(prisma),
    ),
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    { signAsync: jest.fn(async () => 'access-jwt') } as never,
    config as never,
    NO_EMAIL_VERIFICATION as never,
  );
  return { service, prisma };
}

describe('demo users and auth', () => {
  it('treats a demo past its expiry as ended, and real users never', () => {
    const now = new Date('2026-10-26T12:00:00.000Z');
    expect(
      demoHasEnded(
        { isDemo: true, expiresAt: new Date(now.getTime() - 1) },
        now,
      ),
    ).toBe(true);
    expect(
      demoHasEnded(
        { isDemo: true, expiresAt: new Date(now.getTime() + 1) },
        now,
      ),
    ).toBe(false);
    expect(demoHasEnded({ isDemo: false, expiresAt: null }, now)).toBe(false);
  });

  it('stops refreshing a demo session once the demo has ended', async () => {
    const { service, prisma } = makeAuth({
      id: 'demo-user',
      email: demoEmail('x'),
      isDemo: true,
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('reports who a live refresh token belongs to without rotating it', async () => {
    const user = { id: 'demo-user', isDemo: true };
    const { service, prisma } = makeAuth(user);

    expect(await service.liveSessionUser('token')).toBe(user);
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256('token') },
      include: { user: true },
    });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('refuses registration on the reserved demo domain', () => {
    const result = registerSchema.safeParse({
      email: demoEmail('mine'),
      password: 'long-enough',
    });
    expect(result.success).toBe(false);
    expect(
      registerSchema.safeParse({
        email: 'me@example.com',
        password: 'long-enough',
      }).success,
    ).toBe(true);
  });

  it('refuses a demo user the session handoff that connecting an AI app needs', async () => {
    const prisma = { authSession: { create: jest.fn() } };
    const jwt = {
      verifyAsync: jest.fn(async () => ({
        sub: 'demo-user',
        email: demoEmail('x'),
      })),
    };
    const oauth = new OAuthService(
      prisma as never,
      jwt as never,
      {
        getOrThrow: () => 600,
      } as never,
    );

    await expect(oauth.createHandoff('access')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });
});
