import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { UsersService } from './users.service';

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
