import { GatewayTimeoutException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService refresh token rotation', () => {
  const FUTURE = new Date(Date.now() + 60_000);
  const user = { id: 'u1', email: 'a@b.com' };

  function makeService(overrides: {
    stored?: unknown;
    findUser?: unknown;
  }) {
    const refreshToken = {
      findUnique: jest.fn(async () => overrides.stored ?? null),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async () => ({})),
    };
    const prisma = {
      refreshToken,
      user: { findUnique: jest.fn(async () => (overrides.findUser === undefined ? user : overrides.findUser)) },
    };
    const jwtService = { signAsync: jest.fn(async () => 'access-jwt') };
    const config = {
      getOrThrow: (key: string) => (key === 'OAUTH_ISSUER' ? 'http://localhost:3000' : `${key}-secret`),
      get: (key: string, fallback: string) => fallback,
    };
    const service = new AuthService(prisma as never, {} as never, jwtService as never, config as never);
    return { service, prisma };
  }

  it('rejects an unknown refresh token', async () => {
    const { service } = makeService({ stored: null });
    await expect(service.refreshTokens('nope')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates a valid token: revokes the old one and issues a new one in the same family', async () => {
    const stored = { id: 'rt1', userId: 'u1', familyId: 'fam1', revokedAt: null, rotatedToId: null, expiresAt: FUTURE };
    const { service, prisma } = makeService({ stored });

    const result = await service.refreshTokens('old-token');

    expect(result.accessToken).toBe('access-jwt');
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rt1' }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', familyId: 'fam1' }) }),
    );
  });

  it('detects reuse of an already-rotated token and revokes the whole family', async () => {
    const stored = { id: 'rt1', userId: 'u1', familyId: 'fam1', revokedAt: null, rotatedToId: 'rt2-hash', expiresAt: FUTURE };
    const { service, prisma } = makeService({ stored });

    await expect(service.refreshTokens('stolen-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('detects reuse of an already-revoked token and revokes the whole family', async () => {
    const stored = { id: 'rt1', userId: 'u1', familyId: 'fam1', revokedAt: new Date(), rotatedToId: null, expiresAt: FUTURE };
    const { service, prisma } = makeService({ stored });

    await expect(service.refreshTokens('revoked-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const stored = { id: 'rt1', userId: 'u1', familyId: 'fam1', revokedAt: null, rotatedToId: null, expiresAt: new Date(0) };
    const { service } = makeService({ stored });
    await expect(service.refreshTokens('expired-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the user behind a valid token no longer exists', async () => {
    const stored = { id: 'rt1', userId: 'deleted-user', familyId: 'fam1', revokedAt: null, rotatedToId: null, expiresAt: FUTURE };
    const { service } = makeService({ stored, findUser: null });
    await expect(service.refreshTokens('token-for-deleted-user')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout revokes every non-revoked token in the presented token family', async () => {
    const stored = { id: 'rt1', userId: 'u1', familyId: 'fam1', revokedAt: null, rotatedToId: null, expiresAt: FUTURE };
    const { service, prisma } = makeService({ stored });

    await service.logout('some-token');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('logout is a no-op for an unknown token (already logged out / never existed)', async () => {
    const { service, prisma } = makeService({ stored: null });
    await service.logout('unknown-token');
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('AuthService.loginWithGoogle timeout handling', () => {
  const config = {
    get: (key: string) =>
      ({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_TOKEN_URL: 'https://google.example/token' })[
        key
      ],
  };
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('surfaces a Google timeout as GatewayTimeoutException (504), not a hang or generic 500', async () => {
    global.fetch = jest.fn(() => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      return Promise.reject(err);
    }) as never;
    const service = new AuthService({} as never, {} as never, {} as never, config as never);
    await expect(service.loginWithGoogle('code', 'https://web.example/callback')).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  });

  it('surfaces a network error as ServiceUnavailableException, distinct from a timeout', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))) as never;
    const service = new AuthService({} as never, {} as never, {} as never, config as never);
    await expect(service.loginWithGoogle('code', 'https://web.example/callback')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('AuthService.login timing-safe unknown-email handling (audit SEC-XX)', () => {
  const config = {
    getOrThrow: (key: string) => (key === 'OAUTH_ISSUER' ? 'http://localhost:3000' : `${key}-secret`),
    get: (key: string, fallback: string) => fallback,
  };

  function makeService(usersService: { findByEmail: jest.Mock }) {
    const prisma = { refreshToken: { create: jest.fn(async () => ({})) } };
    const jwtService = { signAsync: jest.fn(async () => 'access-jwt') };
    return new AuthService(prisma as never, usersService as never, jwtService as never, config as never);
  }

  afterEach(() => jest.restoreAllMocks());

  it('still runs a bcrypt compare for an email that does not exist (no short-circuit)', async () => {
    const compareSpy = jest.spyOn(bcrypt, 'compare');
    const service = makeService({ findByEmail: jest.fn(async () => null) });

    await expect(service.login({ email: 'nobody@example.com', password: 'whatever' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it('still runs a bcrypt compare for a Google-only account with no passwordHash', async () => {
    const compareSpy = jest.spyOn(bcrypt, 'compare');
    const service = makeService({ findByEmail: jest.fn(async () => ({ id: 'u1', email: 'a@b.com', passwordHash: null })) });

    await expect(service.login({ email: 'a@b.com', password: 'whatever' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it('still logs in successfully with the correct password (regression check)', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 4);
    const service = makeService({
      findByEmail: jest.fn(async () => ({ id: 'u1', email: 'a@b.com', passwordHash })),
    });

    const result = await service.login({ email: 'a@b.com', password: 'correct-horse' });
    expect(result.accessToken).toBe('access-jwt');
  });
});

describe('AuthService.register uniform response (audit SEC-XX)', () => {
  function makeService(overrides: { findByEmail: unknown; createUser?: jest.Mock }) {
    const usersService = {
      findByEmail: jest.fn(async () => overrides.findByEmail),
      createUser: overrides.createUser ?? jest.fn(async () => ({ id: 'new-user', email: 'a@b.com' })),
    };
    const service = new AuthService({} as never, usersService as never, {} as never, {} as never);
    return { service, usersService };
  }

  it('creates the user and returns the generic message for a brand-new email', async () => {
    const { service, usersService } = makeService({ findByEmail: null });

    const result = await service.register({ email: 'new@example.com', password: 'password123' });

    expect(usersService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' }),
    );
    expect(result).toEqual({ message: expect.any(String) });
    expect(result).not.toHaveProperty('accessToken');
  });

  it('returns the exact same response shape for an already-registered email, without creating a duplicate', async () => {
    const { service, usersService } = makeService({ findByEmail: { id: 'existing', email: 'a@b.com' } });

    const result = await service.register({ email: 'a@b.com', password: 'password123' });

    expect(usersService.createUser).not.toHaveBeenCalled();
    expect(result).toEqual({ message: expect.any(String) });
  });

  it('produces byte-identical messages for the new-email and already-registered paths', async () => {
    const fresh = await makeService({ findByEmail: null }).service.register({
      email: 'new@example.com',
      password: 'password123',
    });
    const existing = await makeService({ findByEmail: { id: 'existing', email: 'a@b.com' } }).service.register({
      email: 'a@b.com',
      password: 'password123',
    });

    expect(fresh).toEqual(existing);
  });
});
