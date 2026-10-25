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
