import { NotFoundException } from '@nestjs/common';
import { sha256 } from '../../common/utils/hash';
import { OAuthService } from './oauth.service';

function makeService(prisma: Record<string, unknown>) {
  return new OAuthService(prisma as never, {} as never, {} as never);
}

describe('OAuthService revocation', () => {
  describe('revokeGrant', () => {
    function prismaWith(deletedGrants: number) {
      const prisma = {
        oAuthGrant: { deleteMany: jest.fn(() => 'grant') },
        oAuthRefreshToken: { updateMany: jest.fn(() => 'tokens') },
        authorizationCode: { deleteMany: jest.fn(() => 'codes') },
        $transaction: jest.fn(async () => [{ count: deletedGrants }, { count: 2 }, { count: 0 }]),
      };
      return prisma;
    }

    it('forgets consent, revokes the client\'s refresh tokens and drops unused codes, scoped to this user+client', async () => {
      const prisma = prismaWith(1);
      await makeService(prisma).revokeGrant('u1', 'client-a');

      expect(prisma.oAuthGrant.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', clientId: 'client-a' } });
      expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', clientId: 'client-a', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.authorizationCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', clientId: 'client-a', usedAt: null },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('404s when the user has no such connected app', async () => {
      await expect(makeService(prismaWith(0)).revokeGrant('u1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('revokeToken (RFC 7009)', () => {
    it('revokes the whole rotation family of a known refresh token', async () => {
      const prisma = {
        oAuthRefreshToken: {
          findUnique: jest.fn(async () => ({ familyId: 'fam1' })),
          updateMany: jest.fn(async () => ({ count: 3 })),
        },
      };
      await makeService(prisma).revokeToken('raw-token');

      expect(prisma.oAuthRefreshToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: sha256('raw-token') } });
      expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('silently succeeds for an unknown token without touching anything', async () => {
      const prisma = {
        oAuthRefreshToken: { findUnique: jest.fn(async () => null), updateMany: jest.fn() },
      };
      await expect(makeService(prisma).revokeToken('garbage')).resolves.toBeUndefined();
      expect(prisma.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('listGrants', () => {
    it('joins client names and flags apps that still hold a live refresh token', async () => {
      const prisma = {
        oAuthGrant: {
          findMany: jest.fn(async () => [
            { clientId: 'a', scope: 'mcp' },
            { clientId: 'b', scope: 'mcp' },
          ]),
        },
        oAuthRefreshToken: { findMany: jest.fn(async () => [{ clientId: 'a' }]) },
        oAuthClient: { findMany: jest.fn(async () => [{ clientId: 'a', clientName: 'Claude' }]) },
      };
      const result = await makeService(prisma).listGrants('u1');

      expect(result).toEqual([
        { clientId: 'a', clientName: 'Claude', scope: 'mcp', active: true },
        { clientId: 'b', clientName: null, scope: 'mcp', active: false },
      ]);
    });
  });
});
