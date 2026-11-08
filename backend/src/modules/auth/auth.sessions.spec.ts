import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { sha256 } from '../../common/utils/hash';
import { AuthService, GOOGLE_ONLY_PASSWORD_MESSAGE } from './auth.service';

// Stands in for EmailVerificationService where verification is not under test.
const NO_EMAIL_VERIFICATION = {
  isRequiredFor: () => false,
  runInBackground: () => undefined,
  sendLink: async () => ({ alreadyVerified: false }),
  sendAccountExistsNotice: async () => undefined,
};

describe('AuthService password change and sign-out everywhere', () => {
  type Row = {
    id: string;
    tokenHash: string;
    userId: string;
    familyId: string;
    revokedAt: Date | null;
    rotatedToId: string | null;
    expiresAt: Date;
  };
  type UserRow = { id: string; email: string; passwordHash: string | null };
  type ResetRow = { userId: string; usedAt: Date | null };
  const config = {
    getOrThrow: (key: string) =>
      key === 'OAUTH_ISSUER' ? 'http://localhost:3000' : `${key}-secret`,
    get: (key: string, fallback: string) => fallback,
  };
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('old-password', 4);
  });

  function makeStore() {
    const users: UserRow[] = [
      { id: 'u1', email: 'a@b.com', passwordHash },
      { id: 'u2', email: 'c@d.com', passwordHash },
      { id: 'google', email: 'g@b.com', passwordHash: null },
    ];
    const rows: Row[] = [];
    const resets: ResetRow[] = [
      { userId: 'u1', usedAt: null },
      { userId: 'u2', usedAt: null },
    ];
    const matches = <T extends object>(
      row: T,
      where: Record<string, unknown>,
    ) =>
      Object.entries(where).every(([key, value]) => {
        const actual = row[key as keyof T];
        if (value && typeof value === 'object' && 'not' in value)
          return actual !== value.not;
        return actual === value;
      });
    const updateMany =
      <T extends object>(table: T[]) =>
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<T>;
      }) => {
        const hit = table.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      };
    const prisma = {
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const row = users.find((u) => u.id === where.id);
          return row ? { ...row } : null;
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<UserRow>;
          }) => {
            const row = users.find((u) => u.id === where.id)!;
            return Object.assign(row, data);
          },
        ),
      },
      refreshToken: {
        findUnique: jest.fn(
          async ({ where }: { where: Record<string, unknown> }) => {
            const row = rows.find((r) => matches(r, where));
            return row ? { ...row } : null;
          },
        ),
        updateMany: jest.fn(updateMany(rows)),
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
      },
      passwordResetToken: { updateMany: jest.fn(updateMany(resets)) },
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
      NO_EMAIL_VERIFICATION as never,
    );
    let families = 0;
    const login = async (userId = 'u1') => {
      families += 1;
      const { refreshToken } = await service['issueTokens'](
        userId,
        'x@y.com',
        `fam${families}`,
      );
      return refreshToken;
    };
    const row = (token: string) =>
      rows.find((r) => r.tokenHash === sha256(token))!;
    const user = (id: string) => users.find((u) => u.id === id)!;
    return { service, login, row, user, resets };
  }

  async function fieldErrors(promise: Promise<unknown>) {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BadRequestException);
    return (
      (err as BadRequestException).getResponse() as {
        errors?: { path: string; message: string }[];
      }
    ).errors;
  }

  describe('changePassword', () => {
    it('refuses a wrong current password with a field error, and changes nothing', async () => {
      const { service, login, row, user, resets } = makeStore();
      const other = await login();
      const current = await login();

      const errors = await fieldErrors(
        service.changePassword('u1', {
          currentPassword: 'wrong',
          newPassword: 'new-password',
          refreshToken: current,
        }),
      );

      expect(errors).toEqual([
        { path: 'currentPassword', message: expect.any(String) },
      ]);
      expect(user('u1').passwordHash).toBe(passwordHash);
      expect(row(other).revokedAt).toBeNull();
      expect(resets[0].usedAt).toBeNull();
    });

    it('says a Google-only account has no password to change', async () => {
      const { service } = makeStore();

      await expect(
        service.changePassword('google', {
          currentPassword: 'anything',
          newPassword: 'new-password',
        }),
      ).rejects.toThrow(GOOGLE_ONLY_PASSWORD_MESSAGE);
    });

    it('refuses a new password equal to the current one', async () => {
      const { service, user } = makeStore();

      const errors = await fieldErrors(
        service.changePassword('u1', {
          currentPassword: 'old-password',
          newPassword: 'old-password',
        }),
      );

      expect(errors).toEqual([
        { path: 'newPassword', message: expect.any(String) },
      ]);
      expect(user('u1').passwordHash).toBe(passwordHash);
    });

    it('answers 401 for a user that no longer exists', async () => {
      const { service } = makeStore();

      await expect(
        service.changePassword('gone', {
          currentPassword: 'old-password',
          newPassword: 'new-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('stores a bcrypt hash of the new password', async () => {
      const { service, user } = makeStore();

      await service.changePassword('u1', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      });

      expect(
        await bcrypt.compare('new-password', user('u1').passwordHash!),
      ).toBe(true);
      expect(
        await bcrypt.compare('old-password', user('u1').passwordHash!),
      ).toBe(false);
    });

    it("signs out every other session but keeps the caller's, which can still refresh", async () => {
      const { service, login, row } = makeStore();
      const laptop = await login();
      const phone = await login();
      const current = await login();
      // The caller's session has rotated since login; its family is what counts.
      const rotated = (await service.refreshTokens(current)).refreshToken;

      const result = await service.changePassword('u1', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
        refreshToken: rotated,
      });

      expect(result).toEqual({ message: 'Password changed.' });
      expect(row(laptop).revokedAt).not.toBeNull();
      expect(row(phone).revokedAt).not.toBeNull();
      expect(row(rotated).revokedAt).toBeNull();
      await expect(service.refreshTokens(laptop)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.refreshTokens(phone)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.refreshTokens(rotated)).resolves.toEqual({
        accessToken: 'access-jwt',
        refreshToken: expect.any(String),
      });
    });

    it('signs out every session when no refresh token is given', async () => {
      const { service, login, row } = makeStore();
      const a = await login();
      const b = await login();

      await service.changePassword('u1', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      });

      expect(row(a).revokedAt).not.toBeNull();
      expect(row(b).revokedAt).not.toBeNull();
    });

    it("does not let another user's refresh token shield a session", async () => {
      const { service, login, row } = makeStore();
      const mine = await login('u1');
      const theirs = await login('u2');

      await service.changePassword('u1', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
        refreshToken: theirs,
      });

      expect(row(mine).revokedAt).not.toBeNull();
      expect(row(theirs).revokedAt).toBeNull();
    });

    it("spends the user's outstanding reset links, and only theirs", async () => {
      const { service, resets } = makeStore();

      await service.changePassword('u1', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      });

      expect(resets[0].usedAt).not.toBeNull();
      expect(resets[1].usedAt).toBeNull();
    });
  });

  describe('revokeAllSessions', () => {
    it("revokes every refresh token of the user, so none can refresh, and leaves other users' alone", async () => {
      const { service, login, row } = makeStore();
      const a = await login();
      const b = await login();
      const rotatedB = (await service.refreshTokens(b)).refreshToken;
      const theirs = await login('u2');

      await service.revokeAllSessions('u1');

      for (const token of [a, b, rotatedB]) {
        expect(row(token).revokedAt).not.toBeNull();
        await expect(service.refreshTokens(token)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }
      expect(row(theirs).revokedAt).toBeNull();
    });
  });
});
