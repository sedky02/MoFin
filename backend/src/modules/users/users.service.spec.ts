import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { UsersService } from './users.service';

describe('UsersService profile', () => {
  const base = { id: 'u1', email: 'a@b.com', displayName: null, settings: {}, createdAt: new Date(), updatedAt: new Date() };

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
  ])('reports hasPassword for %s without exposing the hash', async (_label, hash, hasPassword) => {
    const service = makeService(hash);

    for (const profile of [await service.getProfile('u1'), await service.updateProfile('u1', { displayName: 'A' })]) {
      expect(profile).toMatchObject({ id: 'u1', hasPassword });
      expect(profile).not.toHaveProperty('passwordHash');
    }
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
