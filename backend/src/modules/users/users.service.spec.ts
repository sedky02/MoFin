import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService profile', () => {
  const base = {
    id: 'u1',
    email: 'a@b.com',
    displayName: null,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function makeService(passwordHash: string | null) {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({ ...base, passwordHash })),
        update: jest.fn(async () => ({ ...base, passwordHash })),
      },
    };
    return new UsersService(prisma as never);
  }

  it.each([
    ['a password account', '$2b$12$hash', true],
    ['a Google-only account', null, false],
  ])(
    'reports hasPassword for %s without exposing the hash',
    async (_label, hash, hasPassword) => {
      const service = makeService(hash);

      for (const profile of [
        await service.getProfile('u1'),
        await service.updateProfile('u1', { displayName: 'A' }),
      ]) {
        expect(profile).toMatchObject({ id: 'u1', hasPassword });
        expect(profile).not.toHaveProperty('passwordHash');
      }
    },
  );
});

describe('UsersService.deleteAccount and resetData', () => {
  // The user-owned tables a data reset clears, in the order the service must clear them.
  const DATA_TABLES = [
    'accountMember',
    'transactionItem',
    'transaction',
    'draftTransaction',
    'goalInstance',
    'goal',
    'account',
    'category',
    'analyticsCache',
    'aiChat',
  ] as const;
  // Sign-ins: cleared with the account, kept by a reset.
  const SIGN_IN_TABLES = [
    'refreshToken',
    'authSession',
    'passwordResetToken',
    'emailVerificationToken',
    'oAuthRefreshToken',
    'authorizationCode',
    'oAuthGrant',
    'pushDevice',
    'aiCredential',
  ] as const;

  function makeService(
    user: { settings: Record<string, unknown> } | null = { settings: {} },
  ) {
    const calls: { table: string; op: string; arg: unknown }[] = [];
    const record = (table: string, op: string) =>
      jest.fn(async (arg: unknown) => calls.push({ table, op, arg }));
    const tx: Record<string, unknown> = {
      user: {
        findUnique: jest.fn(async () => user),
        update: record('user', 'update'),
        delete: record('user', 'delete'),
      },
      category: {
        deleteMany: record('category', 'deleteMany'),
        createMany: record('category', 'createMany'),
      },
    };
    for (const table of [...DATA_TABLES, ...SIGN_IN_TABLES]) {
      if (table !== 'category')
        tx[table] = { deleteMany: record(table, 'deleteMany') };
    }
    (tx.accountMember as Record<string, unknown>).findMany = jest.fn(
      async () => [],
    );
    const prisma = {
      user: { findUnique: jest.fn(async () => user && { id: 'u1' }) },
      $transaction: jest.fn(async (run: (client: unknown) => unknown) =>
        run(tx),
      ),
    };
    return { service: new UsersService(prisma as never), prisma, calls };
  }

  const cleared = (calls: { table: string; op: string }[]) =>
    calls.filter((c) => c.op === 'deleteMany').map((c) => c.table);

  describe('deleteAccount', () => {
    it('clears every user-owned table for this user only, children first, then the user, in one transaction', async () => {
      const { service, prisma, calls } = makeService();

      await service.deleteAccount('u1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(calls.map((c) => c.table)).toEqual([
        ...DATA_TABLES,
        ...SIGN_IN_TABLES,
        'user',
      ]);
      for (const call of calls) {
        const { arg } = call as { arg: { where: unknown } };
        if (call.table === 'user') expect(arg.where).toEqual({ id: 'u1' });
        else if (call.table === 'goalInstance')
          expect(arg.where).toEqual({ goal: { userId: 'u1' } });
        // Exactly the user's rows: no deletedAt filter (soft-deleted go too), and
        // never `userId: null`, so global categories stay.
        else expect(arg.where).toEqual({ userId: 'u1' });
      }
    });

    it('answers 401 when the account is already gone', async () => {
      const { service, prisma } = makeService(null);
      await expect(service.deleteAccount('u1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('resetData', () => {
    it('clears what the user recorded, children first, and leaves sessions, connected apps and the user alone', async () => {
      const { service, prisma, calls } = makeService();

      await service.resetData('u1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(cleared(calls)).toEqual([...DATA_TABLES]);
      expect(calls.some((c) => c.op === 'delete')).toBe(false);
      for (const call of calls.filter((c) => c.op === 'deleteMany')) {
        const { arg } = call as { arg: { where: unknown } };
        expect(arg.where).toEqual(
          call.table === 'goalInstance'
            ? { goal: { userId: 'u1' } }
            : { userId: 'u1' },
        );
      }
    });

    it('gives the starter categories back, owned by the user, after the old ones are gone', async () => {
      const { service, calls } = makeService();

      await service.resetData('u1');

      const clearedAt = calls.findIndex(
        (c) => c.table === 'category' && c.op === 'deleteMany',
      );
      const createdAt = calls.findIndex(
        (c) => c.table === 'category' && c.op === 'createMany',
      );
      expect(createdAt).toBeGreaterThan(clearedAt);
      const { data } = calls[createdAt].arg as {
        data: { name: string; userId: string }[];
      };
      expect(data.map((c) => c.name)).toEqual(
        DEFAULT_CATEGORIES.map((c) => c.name),
      );
      expect(data.every((c) => c.userId === 'u1')).toBe(true);
    });

    it('unsets the main account but keeps every other setting', async () => {
      const { service, calls } = makeService({
        settings: { mainAccountId: 'acc-1', defaultCurrency: 'EUR' },
      });

      await service.resetData('u1');

      expect(calls.find((c) => c.table === 'user')?.arg).toEqual({
        where: { id: 'u1' },
        data: { settings: { defaultCurrency: 'EUR' } },
      });
    });

    it('answers 401 when the account is already gone', async () => {
      const { service, prisma } = makeService(null);
      await expect(service.resetData('u1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

describe('UsersService.createUser', () => {
  it('creates the default categories in the same write as the user', async () => {
    const create = jest.fn(async () => ({ id: 'u1', email: 'a@b.com' }));
    const service = new UsersService({ user: { create } } as never);

    await service.createUser({ email: 'a@b.com', passwordHash: 'hash' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        email: 'a@b.com',
        passwordHash: 'hash',
        categories: { createMany: { data: [...DEFAULT_CATEGORIES] } },
      },
    });
  });

  it('defaults to five everyday expense categories and four income ones', () => {
    expect(DEFAULT_CATEGORIES.map((c) => `${c.type}:${c.name}`)).toEqual([
      'EXPENSE:Food',
      'EXPENSE:Drinks',
      'EXPENSE:Rent',
      'EXPENSE:Subscriptions',
      'EXPENSE:Transport',
      'INCOME:Freelance',
      'INCOME:Salary',
      'INCOME:Allowance',
      'INCOME:Trade',
    ]);
  });
});
