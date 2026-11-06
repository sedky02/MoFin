import {
  GatewayTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { sha256 } from '../../common/utils/hash';
import { AuthService } from './auth.service';

describe('AuthService refresh token rotation', () => {
  const FUTURE = new Date(Date.now() + 60_000);
  const user = { id: 'u1', email: 'a@b.com' };
  const config = {
    getOrThrow: (key: string) =>
      key === 'OAUTH_ISSUER' ? 'http://localhost:3000' : `${key}-secret`,
    get: (key: string, fallback: string) => fallback,
  };

  function makeService(overrides: { stored?: unknown; findUser?: unknown }) {
    const refreshToken = {
      findUnique: jest.fn(async () => overrides.stored ?? null),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async () => ({})),
    };
    const prisma = {
      refreshToken,
      user: {
        findUnique: jest.fn(async () =>
          overrides.findUser === undefined ? user : overrides.findUser,
        ),
      },
      $transaction: jest.fn(
        async (run: (tx: unknown) => unknown): Promise<unknown> => run(prisma),
      ),
    };
    const jwtService = { signAsync: jest.fn(async () => 'access-jwt') };
    const service = new AuthService(
      prisma as never,
      {} as never,
      jwtService as never,
      config as never,
    );
    return { service, prisma };
  }

  it('rejects an unknown refresh token', async () => {
    const { service } = makeService({ stored: null });
    await expect(service.refreshTokens('nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotates a valid token: revokes the old one and issues a new one in the same family', async () => {
    const stored = {
      id: 'rt1',
      userId: 'u1',
      familyId: 'fam1',
      revokedAt: null,
      rotatedToId: null,
      expiresAt: FUTURE,
    };
    const { service, prisma } = makeService({ stored });

    const result = await service.refreshTokens('old-token');

    expect(result.accessToken).toBe('access-jwt');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt1', revokedAt: null, rotatedToId: null },
      data: {
        revokedAt: expect.any(Date),
        rotatedToId: sha256(result.refreshToken),
      },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', familyId: 'fam1' }),
      }),
    );
  });

  it('detects reuse of an already-rotated token and revokes the whole family', async () => {
    const stored = {
      id: 'rt1',
      userId: 'u1',
      familyId: 'fam1',
      revokedAt: null,
      rotatedToId: 'rt2-hash',
      expiresAt: FUTURE,
    };
    const { service, prisma } = makeService({ stored });

    await expect(service.refreshTokens('stolen-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('detects reuse of an already-revoked token and revokes the whole family', async () => {
    const stored = {
      id: 'rt1',
      userId: 'u1',
      familyId: 'fam1',
      revokedAt: new Date(),
      rotatedToId: null,
      expiresAt: FUTURE,
    };
    const { service, prisma } = makeService({ stored });

    await expect(service.refreshTokens('revoked-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const stored = {
      id: 'rt1',
      userId: 'u1',
      familyId: 'fam1',
      revokedAt: null,
      rotatedToId: null,
      expiresAt: new Date(0),
    };
    const { service } = makeService({ stored });
    await expect(service.refreshTokens('expired-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when the user behind a valid token no longer exists', async () => {
    const stored = {
      id: 'rt1',
      userId: 'deleted-user',
      familyId: 'fam1',
      revokedAt: null,
      rotatedToId: null,
      expiresAt: FUTURE,
    };
    const { service } = makeService({ stored, findUser: null });
    await expect(
      service.refreshTokens('token-for-deleted-user'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout revokes every non-revoked token in the presented token family', async () => {
    const stored = {
      id: 'rt1',
      userId: 'u1',
      familyId: 'fam1',
      revokedAt: null,
      rotatedToId: null,
      expiresAt: FUTURE,
    };
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

describe('AuthService refresh grace window', () => {
  type Row = {
    id: string;
    tokenHash: string;
    userId: string;
    familyId: string;
    revokedAt: Date | null;
    rotatedToId: string | null;
    expiresAt: Date;
  };
  const user = { id: 'u1', email: 'a@b.com' };
  const config = {
    getOrThrow: (key: string) =>
      key === 'OAUTH_ISSUER' ? 'http://localhost:3000' : `${key}-secret`,
    get: (key: string, fallback: string) => fallback,
  };

  /** A minimal in-memory RefreshToken table, enough to run real rotations. */
  function makeStore() {
    const rows: Row[] = [];
    const matches = (row: Row, where: Partial<Row>) =>
      Object.entries(where).every(
        ([key, value]) => row[key as keyof Row] === value,
      );
    const refreshToken = {
      findUnique: jest.fn(async ({ where }: { where: Partial<Row> }) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Partial<Row>;
          data: Partial<Row>;
        }) => {
          const hit = rows.filter((r) => matches(r, where));
          hit.forEach((r) => Object.assign(r, data));
          return { count: hit.length };
        },
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: Omit<Row, 'id' | 'revokedAt' | 'rotatedToId'>;
        }) => {
          const row = {
            id: `rt${rows.length + 1}`,
            revokedAt: null,
            rotatedToId: null,
            ...data,
          };
          rows.push(row);
          return row;
        },
      ),
    };
    const prisma = {
      refreshToken,
      user: { findUnique: jest.fn(async () => user) },
      $transaction: jest.fn(
        async (run: (tx: unknown) => unknown): Promise<unknown> => run(prisma),
      ),
    };
    const jwtService = { signAsync: jest.fn(async () => 'access-jwt') };
    const service = new AuthService(
      prisma as never,
      {} as never,
      jwtService as never,
      config as never,
    );
    const login = async () => {
      const { refreshToken: token } = await service['issueTokens'](
        user.id,
        user.email,
        'fam1',
      );
      return token;
    };
    const row = (token: string) =>
      rows.find((r) => r.tokenHash === sha256(token))!;
    return { service, prisma, rows, login, row };
  }

  afterEach(() => jest.useRealTimers());

  it('gives a token rotated less than 30 s ago the same successor, without revoking the family', async () => {
    const { service, rows, login } = makeStore();
    const r0 = await login();
    const first = await service.refreshTokens(r0);

    const again = await service.refreshTokens(r0);

    expect(again.refreshToken).toBe(first.refreshToken);
    expect(again.accessToken).toBe('access-jwt');
    expect(rows).toHaveLength(2);
    expect(
      rows.find((r) => r.tokenHash === sha256(first.refreshToken))?.revokedAt,
    ).toBeNull();
  });

  it('keeps rotating normally from the successor after a retry', async () => {
    const { service, login } = makeStore();
    const r0 = await login();
    const r1 = (await service.refreshTokens(r0)).refreshToken;
    await service.refreshTokens(r0);

    const r2 = (await service.refreshTokens(r1)).refreshToken;

    expect(r2).not.toBe(r1);
    expect(r2).not.toBe(r0);
  });

  it('treats a token rotated more than 30 s ago as reuse and revokes the family', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-25T10:00:00Z') });
    const { service, login, row } = makeStore();
    const r0 = await login();
    const r1 = (await service.refreshTokens(r0)).refreshToken;

    jest.setSystemTime(new Date('2026-10-25T10:00:31Z'));

    await expect(service.refreshTokens(r0)).rejects.toThrow(
      'Refresh token reuse detected',
    );
    expect(row(r1).revokedAt).not.toBeNull();
  });

  it('treats a recent rotation as reuse once its successor has rotated too', async () => {
    const { service, login, row } = makeStore();
    const r0 = await login();
    const r1 = (await service.refreshTokens(r0)).refreshToken;
    const r2 = (await service.refreshTokens(r1)).refreshToken;

    await expect(service.refreshTokens(r0)).rejects.toThrow(
      'Refresh token reuse detected',
    );
    expect(row(r2).revokedAt).not.toBeNull();
  });

  it('does not bring a session back after logout', async () => {
    const { service, login } = makeStore();
    const r0 = await login();
    const r1 = (await service.refreshTokens(r0)).refreshToken;
    await service.logout(r1);

    await expect(service.refreshTokens(r0)).rejects.toThrow(
      'Refresh token reuse detected',
    );
  });

  it('treats a recent rotation to a random (pre-HMAC) successor as reuse', async () => {
    const { service, login, row } = makeStore();
    const r0 = await login();
    Object.assign(row(r0), {
      revokedAt: new Date(),
      rotatedToId: sha256('some-random-successor'),
    });

    await expect(service.refreshTokens(r0)).rejects.toThrow(
      'Refresh token reuse detected',
    );
  });

  it("hands the winner's successor to a refresh that lost a race on the same token", async () => {
    const { service, prisma, login } = makeStore();
    const r0 = await login();
    // Both requests read the token before either claims it.
    const unrotated = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(r0) },
    });
    prisma.refreshToken.findUnique
      .mockResolvedValueOnce(unrotated)
      .mockResolvedValueOnce(unrotated);

    const [a, b] = await Promise.all([
      service.refreshTokens(r0),
      service.refreshTokens(r0),
    ]);

    expect(a.refreshToken).toBe(b.refreshToken);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(2); // login + one rotation
  });

  it('derives a different successor with a different REFRESH_TOKEN_SECRET', async () => {
    const { service, login } = makeStore();
    const r0 = await login();
    const viaDefault = service['successorOf'](r0);
    const other = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {
        ...config,
        getOrThrow: () => 'another-refresh-token-key-of-32-chars',
      } as never,
    );

    expect(other['successorOf'](r0)).not.toBe(viaDefault);
  });
});

describe('AuthService.loginWithGoogle timeout handling', () => {
  const config = {
    get: (key: string) =>
      ({
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_TOKEN_URL: 'https://google.example/token',
      })[key],
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
    const service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      config as never,
    );
    await expect(
      service.loginWithGoogle('code', 'https://web.example/callback'),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('surfaces a network error as ServiceUnavailableException, distinct from a timeout', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('ECONNREFUSED')),
    ) as never;
    const service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      config as never,
    );
    await expect(
      service.loginWithGoogle('code', 'https://web.example/callback'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('AuthService.login timing-safe unknown-email handling (audit SEC-XX)', () => {
  const config = {
    getOrThrow: (key: string) =>
      key === 'OAUTH_ISSUER' ? 'http://localhost:3000' : `${key}-secret`,
    get: (key: string, fallback: string) => fallback,
  };

  function makeService(usersService: { findByEmail: jest.Mock }) {
    const prisma = { refreshToken: { create: jest.fn(async () => ({})) } };
    const jwtService = { signAsync: jest.fn(async () => 'access-jwt') };
    return new AuthService(
      prisma as never,
      usersService as never,
      jwtService as never,
      config as never,
    );
  }

  afterEach(() => jest.restoreAllMocks());

  it('still runs a bcrypt compare for an email that does not exist (no short-circuit)', async () => {
    const compareSpy = jest.spyOn(bcrypt, 'compare');
    const service = makeService({ findByEmail: jest.fn(async () => null) });

    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it('still runs a bcrypt compare for a Google-only account with no passwordHash', async () => {
    const compareSpy = jest.spyOn(bcrypt, 'compare');
    const service = makeService({
      findByEmail: jest.fn(async () => ({
        id: 'u1',
        email: 'a@b.com',
        passwordHash: null,
      })),
    });

    await expect(
      service.login({ email: 'a@b.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it('still logs in successfully with the correct password (regression check)', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 4);
    const service = makeService({
      findByEmail: jest.fn(async () => ({
        id: 'u1',
        email: 'a@b.com',
        passwordHash,
      })),
    });

    const result = await service.login({
      email: 'a@b.com',
      password: 'correct-horse',
    });
    expect(result.accessToken).toBe('access-jwt');
  });
});

describe('AuthService.register uniform response (audit SEC-XX)', () => {
  function makeService(overrides: {
    findByEmail: unknown;
    createUser?: jest.Mock;
  }) {
    const usersService = {
      findByEmail: jest.fn(async () => overrides.findByEmail),
      createUser:
        overrides.createUser ??
        jest.fn(async () => ({ id: 'new-user', email: 'a@b.com' })),
    };
    const service = new AuthService(
      {} as never,
      usersService as never,
      {} as never,
      {} as never,
    );
    return { service, usersService };
  }

  it('creates the user and returns the generic message for a brand-new email', async () => {
    const { service, usersService } = makeService({ findByEmail: null });

    const result = await service.register({
      email: 'new@example.com',
      password: 'password123',
    });

    expect(usersService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' }),
    );
    expect(result).toEqual({ message: expect.any(String) });
    expect(result).not.toHaveProperty('accessToken');
  });

  it('returns the exact same response shape for an already-registered email, without creating a duplicate', async () => {
    const { service, usersService } = makeService({
      findByEmail: { id: 'existing', email: 'a@b.com' },
    });

    const result = await service.register({
      email: 'a@b.com',
      password: 'password123',
    });

    expect(usersService.createUser).not.toHaveBeenCalled();
    expect(result).toEqual({ message: expect.any(String) });
  });

  it('produces byte-identical messages for the new-email and already-registered paths', async () => {
    const fresh = await makeService({ findByEmail: null }).service.register({
      email: 'new@example.com',
      password: 'password123',
    });
    const existing = await makeService({
      findByEmail: { id: 'existing', email: 'a@b.com' },
    }).service.register({
      email: 'a@b.com',
      password: 'password123',
    });

    expect(fresh).toEqual(existing);
  });
});

describe('AuthService.signInWithGoogle (shared by the code flow and the mobile ID token route)', () => {
  type User = {
    id: string;
    email: string;
    googleId: string | null;
    passwordHash: string | null;
    emailVerifiedAt?: Date | null;
    displayName?: string;
  };
  const config = {
    getOrThrow: (key: string) =>
      key === 'OAUTH_ISSUER' ? 'http://localhost:3000' : `${key}-secret`,
    get: (key: string, fallback?: string) =>
      ({
        GOOGLE_CLIENT_ID: 'web-client',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_TOKEN_URL: 'https://google.example/token',
      })[key] ?? fallback,
  };

  function makeService(seed: User[] = []) {
    const users = [...seed];
    const sessions: { userId: string; familyId: string }[] = [];
    const revoked = {
      refreshToken: { updateMany: jest.fn(async () => ({ count: 1 })) },
      oAuthRefreshToken: { updateMany: jest.fn(async () => ({ count: 1 })) },
      authSession: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    };
    const prisma: Record<string, unknown> & {
      user: { findUnique: jest.Mock; update: jest.Mock };
    } = {
      $transaction: jest.fn(async (run: (tx: unknown) => unknown) =>
        run({ ...revoked, user: prisma.user }),
      ),
      user: {
        findUnique: jest.fn(
          async ({ where }: { where: Partial<User> }) =>
            users.find((u) =>
              Object.entries(where).every(([k, v]) => u[k as keyof User] === v),
            ) ?? null,
        ),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: object }) =>
            Object.assign(users.find((u) => u.id === where.id)!, data),
        ),
      },
      refreshToken: {
        create: jest.fn(
          async ({ data }: { data: { userId: string; familyId: string } }) => {
            sessions.push(data);
            return data;
          },
        ),
      },
    };
    const usersService = {
      createUser: jest.fn(async (input: Omit<User, 'id' | 'passwordHash'>) => {
        const user = {
          id: `u${users.length + 1}`,
          passwordHash: null,
          ...input,
        };
        users.push(user);
        return user;
      }),
    };
    const jwtService = {
      signAsync: jest.fn(
        async (payload: { sub: string }) => `jwt-${payload.sub}`,
      ),
    };
    const service = new AuthService(
      prisma as never,
      usersService as never,
      jwtService as never,
      config as never,
    );
    return { service, users, sessions, prisma, revoked };
  }

  const identity = {
    googleId: 'google-sub-1',
    email: ' Jane@Example.com',
    displayName: 'Jane',
  };

  it('creates a passwordless user for a new Google account and signs it in', async () => {
    const { service, users, sessions } = makeService();

    const tokens = await service.signInWithGoogle(identity);

    expect(users).toEqual([
      {
        id: 'u1',
        email: 'jane@example.com',
        googleId: 'google-sub-1',
        emailVerifiedAt: expect.any(Date),
        displayName: 'Jane',
        passwordHash: null,
      },
    ]);
    expect(tokens).toEqual({
      accessToken: 'jwt-u1',
      refreshToken: expect.any(String),
    });
    expect(sessions).toEqual([
      expect.objectContaining({ userId: 'u1', familyId: expect.any(String) }),
    ]);
  });

  it('links the Google id to a verified account with the same email, keeping its password', async () => {
    const verifiedAt = new Date('2026-01-01');
    const { service, users, revoked } = makeService([
      {
        id: 'existing',
        email: 'jane@example.com',
        googleId: null,
        passwordHash: 'hash',
        emailVerifiedAt: verifiedAt,
      },
    ]);

    const tokens = await service.signInWithGoogle(identity);

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: 'existing',
      googleId: 'google-sub-1',
      passwordHash: 'hash',
      emailVerifiedAt: verifiedAt,
    });
    expect(tokens.accessToken).toBe('jwt-existing');
    expect(revoked.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('takes the password and sessions off an unverified account Google links to', async () => {
    const { service, users, revoked } = makeService([
      {
        id: 'existing',
        email: 'jane@example.com',
        googleId: null,
        passwordHash: 'set-by-whoever-registered-it',
        emailVerifiedAt: null,
      },
    ]);

    const tokens = await service.signInWithGoogle(identity);

    expect(users[0]).toMatchObject({
      googleId: 'google-sub-1',
      passwordHash: null,
      emailVerifiedAt: expect.any(Date),
    });
    expect(revoked.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'existing', revokedAt: null },
      }),
    );
    expect(revoked.oAuthRefreshToken.updateMany).toHaveBeenCalled();
    expect(revoked.authSession.deleteMany).toHaveBeenCalled();
    expect(tokens.accessToken).toBe('jwt-existing');
  });

  it('signs the same Google account (sub) into the same user, even after an email change', async () => {
    const { service, users, sessions } = makeService();

    await service.signInWithGoogle(identity);
    const again = await service.signInWithGoogle({
      ...identity,
      email: 'jane.new@example.com',
    });

    expect(users).toHaveLength(1);
    expect(again.accessToken).toBe('jwt-u1');
    // Each sign-in is its own session (token family).
    expect(sessions).toHaveLength(2);
    expect(sessions[0].familyId).not.toBe(sessions[1].familyId);
  });

  describe('code flow (POST /auth/google) goes through it unchanged', () => {
    let originalFetch: typeof fetch;
    beforeEach(() => {
      originalFetch = global.fetch;
    });
    afterEach(() => {
      global.fetch = originalFetch;
    });

    const idTokenWith = (claims: object) =>
      `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

    it('links the code-flow identity to the existing email account', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          id_token: idTokenWith({
            aud: 'web-client',
            iss: 'https://accounts.google.com',
            exp: Math.floor(Date.now() / 1000) + 600,
            sub: 'google-sub-1',
            email: 'Jane@Example.com',
            email_verified: true,
            name: 'Jane',
          }),
        }),
      })) as never;
      const { service, users } = makeService([
        {
          id: 'existing',
          email: 'jane@example.com',
          googleId: null,
          passwordHash: 'hash',
        },
      ]);

      const tokens = await service.loginWithGoogle(
        'code',
        'https://web.example/callback',
      );

      expect(users).toHaveLength(1);
      expect(users[0].googleId).toBe('google-sub-1');
      expect(tokens.accessToken).toBe('jwt-existing');
    });
  });
});
