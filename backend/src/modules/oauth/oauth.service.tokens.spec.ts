import { BadRequestException } from '@nestjs/common';
import { sha256 } from '../../common/utils/hash';
import { OAuthService } from './oauth.service';

describe('OAuthService.exchangeRefreshToken', () => {
  const stored = {
    id: 'rt1',
    tokenHash: sha256('old'),
    userId: 'u1',
    clientId: 'client-a',
    scope: 'mcp',
    resource: null,
    familyId: 'fam1',
    rotatedToId: null as string | null,
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60_000),
  };

  function setup(claimed = 1, row = stored) {
    const db = {
      oAuthRefreshToken: {
        findUnique: jest.fn(async () => row),
        updateMany: jest.fn(async () => ({ count: claimed })),
        create: jest.fn(async () => ({})),
      },
      user: {
        findUnique: jest.fn(async () => ({ id: 'u1', email: 'a@b.c' })),
      },
    };
    const prisma = {
      ...db,
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
    };
    const jwt = { signAsync: jest.fn(async () => 'access') };
    const values: Record<string, unknown> = {
      OAUTH_ISSUER: 'https://api.test',
      OAUTH_REFRESH_TTL: 3600,
      JWT_MCP_SECRET: 's',
    };
    const config = {
      get: jest.fn(
        (key: string, fallback?: unknown) => values[key] ?? fallback,
      ),
      getOrThrow: jest.fn((key: string) => values[key]),
    };
    const service = new OAuthService(
      prisma as never,
      jwt as never,
      config as never,
    );
    return { service, prisma };
  }

  it('claims the presented token and stores its successor in one transaction', async () => {
    const { service, prisma } = setup();
    const result = await service.exchangeRefreshToken({
      refreshToken: 'old',
      clientId: 'client-a',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt1', revokedAt: null, rotatedToId: null },
      data: {
        revokedAt: expect.any(Date),
        rotatedToId: sha256(result.refresh_token),
      },
    });
    expect(prisma.oAuthRefreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: sha256(result.refresh_token),
        familyId: 'fam1',
      }),
    });
  });

  it('treats a lost race as reuse: nothing is issued and the family is revoked', async () => {
    const { service, prisma } = setup(0);
    await expect(
      service.exchangeRefreshToken({
        refreshToken: 'old',
        clientId: 'client-a',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.oAuthRefreshToken.create).not.toHaveBeenCalled();
    expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenLastCalledWith({
      where: { familyId: 'fam1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes the family when an already-rotated token is presented', async () => {
    const { service, prisma } = setup(1, { ...stored, rotatedToId: 'x' });
    await expect(
      service.exchangeRefreshToken({
        refreshToken: 'old',
        clientId: 'client-a',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.oAuthRefreshToken.create).not.toHaveBeenCalled();
  });

  it('refuses a token presented by another client', async () => {
    const { service, prisma } = setup();
    await expect(
      service.exchangeRefreshToken({
        refreshToken: 'old',
        clientId: 'client-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('OAuthService.exchangeAuthorizationCode', () => {
  const record = {
    code: sha256('code'),
    userId: 'u1',
    clientId: 'client-a',
    redirectUri: 'https://app/cb',
    codeChallenge: 'x',
    codeChallengeMethod: 'S256',
    scope: 'mcp',
    resource: null,
    usedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  };

  it("revokes the client's refresh tokens when a used code is presented again", async () => {
    const prisma = {
      authorizationCode: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        findUnique: jest.fn(async () => record),
      },
      oAuthRefreshToken: { updateMany: jest.fn(async () => ({ count: 1 })) },
    };
    const service = new OAuthService(prisma as never, {} as never, {} as never);
    await expect(
      service.exchangeAuthorizationCode({
        code: 'code',
        codeVerifier: 'v',
        clientId: 'client-a',
        redirectUri: 'https://app/cb',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', clientId: 'client-a', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('does not revoke anything for an unknown code', async () => {
    const prisma = {
      authorizationCode: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        findUnique: jest.fn(async () => null),
      },
      oAuthRefreshToken: { updateMany: jest.fn() },
    };
    const service = new OAuthService(prisma as never, {} as never, {} as never);
    await expect(
      service.exchangeAuthorizationCode({
        code: 'nope',
        codeVerifier: 'v',
        clientId: 'client-a',
        redirectUri: 'https://app/cb',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('OAuthService.consumeHandoff', () => {
  function setup(count: number) {
    const prisma = {
      authSession: {
        findUnique: jest.fn(async () => ({
          id: 's1',
          sessionToken: sha256('handoff'),
          expiresAt: new Date(Date.now() + 60_000),
        })),
        updateMany: jest.fn(async () => ({ count })),
      },
    };
    return {
      prisma,
      service: new OAuthService(prisma as never, {} as never, {} as never),
    };
  }

  it('rotates the session value, conditional on the value it read', async () => {
    const { service, prisma } = setup(1);
    const fresh = await service.consumeHandoff('handoff');
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', sessionToken: sha256('handoff') },
      data: { sessionToken: sha256(fresh) },
    });
  });

  it('refuses when another consume rotated it first', async () => {
    const { service } = setup(0);
    await expect(service.consumeHandoff('handoff')).rejects.toThrow(
      'invalid or expired handoff',
    );
  });
});
