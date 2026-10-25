import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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

describe('UsersService.deleteAccount', () => {
  // Every user-owned table, in the order the service must clear them.
  const TABLES = [
    'transactionItem',
    'transaction',
    'draftTransaction',
    'goalInstance',
    'goal',
    'budget',
    'account',
    'category',
    'analyticsCache',
    'refreshToken',
    'authSession',
    'passwordResetToken',
    'oAuthRefreshToken',
    'authorizationCode',
    'oAuthGrant',
  ] as const;

  function makeService(
    user: { email: string; passwordHash: string | null } | null,
  ) {
    const calls: { table: string; where: unknown }[] = [];
    const record = (table: string) =>
      jest.fn(async ({ where }: { where: unknown }) =>
        calls.push({ table, where }),
      );
    const tx: Record<string, unknown> = { user: { delete: record('user') } };
    for (const table of TABLES) tx[table] = { deleteMany: record(table) };
    const prisma = {
      user: { findUnique: jest.fn(async () => user) },
      $transaction: jest.fn(async (run: (client: unknown) => unknown) =>
        run(tx),
      ),
    };
    return { service: new UsersService(prisma as never), prisma, calls };
  }

  async function errorsOf(promise: Promise<unknown>) {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BadRequestException);
    return (
      (err as BadRequestException).getResponse() as {
        errors?: { path: string }[];
      }
    ).errors;
  }

  const hash = bcrypt.hashSync('right-password', 4);

  it('clears every user-owned table for this user only, children first, then the user, in one transaction', async () => {
    const { service, prisma, calls } = makeService({
      email: 'a@b.com',
      passwordHash: hash,
    });

    await service.deleteAccount('u1', { password: 'right-password' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.table)).toEqual([...TABLES, 'user']);
    for (const call of calls) {
      if (call.table === 'user') expect(call.where).toEqual({ id: 'u1' });
      else if (call.table === 'goalInstance')
        expect(call.where).toEqual({ goal: { userId: 'u1' } });
      // Exactly the user's rows: no deletedAt filter (soft-deleted go too), and
      // never `userId: null`, so global categories stay.
      else expect(call.where).toEqual({ userId: 'u1' });
    }
  });

  it.each([
    ['a wrong password', { password: 'wrong-password' }],
    ['no password', {}],
    ['the email instead of the password', { confirmEmail: 'a@b.com' }],
  ])(
    'refuses %s with a field error on password, and deletes nothing',
    async (_label, dto) => {
      const { service, prisma } = makeService({
        email: 'a@b.com',
        passwordHash: hash,
      });

      expect(await errorsOf(service.deleteAccount('u1', dto))).toEqual([
        expect.objectContaining({ path: 'password' }),
      ]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('asks a Google-only account for its email instead, ignoring case and spaces', async () => {
    const { service, prisma, calls } = makeService({
      email: 'g@b.com',
      passwordHash: null,
    });

    for (const dto of [
      { confirmEmail: 'other@b.com' },
      { password: 'anything' },
    ]) {
      expect(await errorsOf(service.deleteAccount('g1', dto))).toEqual([
        expect.objectContaining({ path: 'confirmEmail' }),
      ]);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();

    await service.deleteAccount('g1', { confirmEmail: ' G@B.com ' });
    expect(calls.at(-1)).toEqual({ table: 'user', where: { id: 'g1' } });
  });

  it('answers 401 when the account is already gone', async () => {
    const { service } = makeService(null);
    await expect(
      service.deleteAccount('u1', { password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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

  it('defaults to Salary and Freelance income plus six everyday expense categories', () => {
    expect(DEFAULT_CATEGORIES.map((c) => `${c.type}:${c.name}`)).toEqual([
      'INCOME:Salary',
      'INCOME:Freelance',
      'EXPENSE:Groceries',
      'EXPENSE:Rent',
      'EXPENSE:Dining out',
      'EXPENSE:Transport',
      'EXPENSE:Subscriptions',
      'EXPENSE:Utilities',
    ]);
  });
});
