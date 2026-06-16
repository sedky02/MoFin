import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService.validateApiKey', () => {
  function makeService(findUnique: jest.Mock) {
    const prisma = { apiKey: { findUnique, update: jest.fn(async () => ({})) } };
    return new AuthService(prisma as never, {} as never, {} as never, {} as never);
  }

  it('rejects a malformed key without hitting the database (audit A4)', async () => {
    const findUnique = jest.fn();
    const service = makeService(findUnique);
    await expect(service.validateApiKey('not-a-key')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('looks up exactly one key by id and rejects when none is found', async () => {
    const findUnique = jest.fn(async () => null);
    const service = makeService(findUnique);
    await expect(service.validateApiKey('mcp_abc123.secrethex')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'abc123' } }));
  });

  it('rejects a revoked key', async () => {
    const findUnique = jest.fn(async () => ({ id: 'abc123', revokedAt: new Date(), keyHash: 'h', user: {} }));
    const service = makeService(findUnique);
    await expect(service.validateApiKey('mcp_abc123.secrethex')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
