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
