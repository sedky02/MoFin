import { fakeAccess } from '../../../test/support/fake-account-access';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { CategoriesService } from './categories.service';

describe('CategoriesService.isSystem', () => {
  function makeService(overrides: {
    paginateResult?: unknown[];
    create?: unknown;
    update?: unknown;
    findFirst?: unknown;
  }) {
    const paginate = jest.fn(async () => ({
      data: overrides.paginateResult ?? [],
      total: (overrides.paginateResult ?? []).length,
      limit: 20,
      offset: 0,
    }));
    const prisma = {
      category: {
        create: jest.fn(async () => overrides.create ?? {}),
        update: jest.fn(async () => overrides.update ?? {}),
        findFirst: jest.fn(async () =>
          overrides.findFirst === undefined ? null : overrides.findFirst,
        ),
      },
      paginated: { category: { paginate } },
    };
    return {
      service: new CategoriesService(prisma as never, fakeAccess() as never),
      prisma,
      paginate,
    };
  }

  it("list() marks a userId:null row as isSystem:true and the caller's own row as isSystem:false", async () => {
    const { service } = makeService({
      paginateResult: [
        { id: 'c1', userId: 'u1', name: 'Coffee' },
        { id: 'c2', userId: null, name: 'Groceries' },
      ],
    });
    const result = await service.list('u1', {
      limit: 20,
      offset: 0,
      status: 'active',
    });
    expect(result.data).toEqual([
      { id: 'c1', userId: 'u1', name: 'Coffee', isSystem: false },
      { id: 'c2', userId: null, name: 'Groceries', isSystem: true },
    ]);
    expect(result.total).toBe(2);
  });

  it('list() forwards limit/offset to the pagination extension', async () => {
    const { service, paginate } = makeService({});
    await service.list('u1', { limit: 5, offset: 10, status: 'all' });
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId: 'u1' }, { userId: null }] },
        limit: 5,
        offset: 10,
      }),
    );
  });

  it('create() returns isSystem:false for the always user-owned created category', async () => {
    const { service } = makeService({
      create: { id: 'c1', userId: 'u1', name: 'New' },
    });
    const result = await service.create('u1', {
      name: 'New',
      type: 'EXPENSE',
    } as never);
    expect(result).toEqual({
      id: 'c1',
      userId: 'u1',
      name: 'New',
      isSystem: false,
    });
  });

  it('update() includes isSystem on the returned row', async () => {
    const { service } = makeService({
      findFirst: { id: 'c1', userId: 'u1' },
      update: { id: 'c1', userId: 'u1', name: 'Renamed' },
    });
    const result = await service.update('u1', 'c1', {
      name: 'Renamed',
    });
    expect(result).toEqual({
      id: 'c1',
      userId: 'u1',
      name: 'Renamed',
      isSystem: false,
    });
  });

  it('update() still rejects a category it does not own (e.g. a global/userId:null one) — that 404 stays as defence in depth', async () => {
    const { service } = makeService({ findFirst: null });
    await expect(
      service.update('u1', 'global-cat', { name: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CategoriesService.assertAssignable', () => {
  function makeService(found: unknown) {
    const findFirst = jest.fn(async () => found);
    const service = new CategoriesService(
      { category: { findFirst } } as never,
      fakeAccess() as never,
    );
    return { service, findFirst };
  }

  const groceries = {
    id: 'c-groceries',
    userId: null,
    name: 'Groceries',
    type: 'EXPENSE',
  };
  const salary = {
    id: 'c-salary',
    userId: 'u1',
    name: 'Salary',
    type: 'INCOME',
  };

  it('returns null without a lookup when no category is given', async () => {
    const { service, findFirst } = makeService(groceries);
    await expect(
      service.assertAssignable('u1', TransactionType.INCOME, undefined),
    ).resolves.toBeNull();
    await expect(
      service.assertAssignable('u1', TransactionType.TRANSFER, null),
    ).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('accepts a category whose type matches the transaction', async () => {
    const { service } = makeService(salary);
    await expect(
      service.assertAssignable('u1', TransactionType.INCOME, 'c-salary'),
    ).resolves.toEqual(salary);
  });

  it('rejects an expense category on an income transaction with a domain message', async () => {
    const { service } = makeService(groceries);
    const result = service.assertAssignable(
      'u1',
      TransactionType.INCOME,
      'c-groceries',
    );
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(
      '"Groceries" is an expense category and cannot be used on an income transaction',
    );
  });

  it('rejects an income category on an expense transaction', async () => {
    const { service } = makeService(salary);
    await expect(
      service.assertAssignable('u1', TransactionType.EXPENSE, 'c-salary'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects any category on a transfer, before looking it up', async () => {
    const { service, findFirst } = makeService(groceries);
    const result = service.assertAssignable(
      'u1',
      TransactionType.TRANSFER,
      'c-groceries',
    );
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow('Transfers cannot have a category');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('still 404s a category the user cannot see', async () => {
    const { service } = makeService(null);
    await expect(
      service.assertAssignable('u1', TransactionType.EXPENSE, 'someone-elses'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CategoriesService archiving', () => {
  const used = {
    id: 'c1',
    userId: 'u1',
    name: 'Groceries',
    type: 'EXPENSE',
    archivedAt: null as Date | null,
  };

  function makeService(
    found: unknown,
    counts = { transactions: 3, budgets: 0 },
  ) {
    const prisma = {
      category: {
        findFirst: jest.fn(async () => found),
        update: jest.fn(async ({ data }: { data: object }) => ({
          ...used,
          ...data,
        })),
        delete: jest.fn(async () => ({})),
      },
      transaction: {
        count: jest.fn(async () => counts.transactions),
        updateMany: jest.fn(),
      },
      transactionItem: { updateMany: jest.fn() },
      budget: { count: jest.fn(async () => counts.budgets) },
      paginated: {
        category: {
          paginate: jest.fn(async () => ({
            data: [],
            total: 0,
            limit: 100,
            offset: 0,
          })),
        },
      },
    };
    return {
      service: new CategoriesService(prisma as never, fakeAccess() as never),
      prisma,
    };
  }

  it('archive() succeeds on a category used by transactions, and only stamps archivedAt', async () => {
    const { service, prisma } = makeService(used);
    const result = await service.archive('u1', 'c1');
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { archivedAt: expect.any(Date) },
    });
    expect(result.archivedAt).toBeInstanceOf(Date);
    expect(result.isSystem).toBe(false);
    // The transactions that use it keep it.
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    expect(prisma.transactionItem.updateMany).not.toHaveBeenCalled();
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('archive() is a no-op on an already archived category', async () => {
    const { service, prisma } = makeService({
      ...used,
      archivedAt: new Date('2026-10-01'),
    });
    await service.archive('u1', 'c1');
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("archive() 404s a category the caller doesn't own (global ones included)", async () => {
    const { service, prisma } = makeService(null);
    await expect(service.archive('u1', 'global-cat')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'global-cat', userId: 'u1' },
    });
  });

  it('list() leaves archived categories out by default', async () => {
    const { service, prisma } = makeService(null);
    await service.list('u1', { limit: 100, offset: 0, status: 'active' });
    expect(prisma.paginated.category.paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId: 'u1' }, { userId: null }], archivedAt: null },
      }),
    );
  });

  it('list() includes them with status=all, and only them with status=archived', async () => {
    const { service, prisma } = makeService(null);
    await service.list('u1', { limit: 100, offset: 0, status: 'all' });
    expect(prisma.paginated.category.paginate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId: 'u1' }, { userId: null }] },
      }),
    );
    await service.list('u1', { limit: 100, offset: 0, status: 'archived' });
    expect(prisma.paginated.category.paginate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ userId: 'u1' }, { userId: null }],
          archivedAt: { not: null },
        },
      }),
    );
  });

  it('assertAssignable() still accepts an archived category, so old transactions stay editable', async () => {
    const archived = { ...used, archivedAt: new Date('2026-10-01') };
    const { service } = makeService(archived);
    await expect(
      service.assertAssignable('u1', TransactionType.EXPENSE, 'c1'),
    ).resolves.toEqual(archived);
  });

  it('restore() clears archivedAt on an archived category', async () => {
    const { service, prisma } = makeService({
      ...used,
      archivedAt: new Date('2026-10-01'),
    });
    const result = await service.restore('u1', 'c1');
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', userId: 'u1', archivedAt: { not: null } },
    });
    expect(result.archivedAt).toBeNull();
  });

  it('restore() 404s a category that is not archived', async () => {
    const { service } = makeService(null);
    await expect(service.restore('u1', 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('usage() counts live transactions using it directly or on a split line, plus budgets', async () => {
    const { service, prisma } = makeService(used, {
      transactions: 4,
      budgets: 1,
    });
    await expect(service.usage('u1', 'c1')).resolves.toEqual({
      transactions: 4,
      budgets: 1,
    });
    expect(prisma.transaction.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [{ categoryId: 'c1' }, { items: { some: { categoryId: 'c1' } } }],
      },
    });
  });

  it('remove() refuses a category in use and points at archiving', async () => {
    const { service, prisma } = makeService(used);
    const result = service.remove('u1', 'c1');
    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.toThrow(/Archive it instead/);
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('remove() still counts budgets', async () => {
    const { service } = makeService(used, { transactions: 0, budgets: 1 });
    await expect(service.remove('u1', 'c1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('remove() deletes an unused category', async () => {
    const { service, prisma } = makeService(used, {
      transactions: 0,
      budgets: 0,
    });
    await service.remove('u1', 'c1');
    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });
});

describe('CategoriesService.create name clash', () => {
  const clash = new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    {
      code: 'P2002',
      clientVersion: 'test',
    },
  );

  function makeService(archived: unknown) {
    const prisma = {
      category: {
        create: jest.fn(async () => {
          throw clash;
        }),
        findFirst: jest.fn(async () => archived),
      },
    };
    return new CategoriesService(prisma as never, fakeAccess() as never);
  }

  it('says the name belongs to an archived category', async () => {
    const result = makeService({ id: 'c1', archivedAt: new Date() }).create(
      'u1',
      {
        name: 'Groceries',
        type: 'EXPENSE',
      } as never,
    );
    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.toThrow(
      '"Groceries" is archived. Restore it from your archived categories instead.',
    );
  });

  it('rethrows the original error when no archived category has the name', async () => {
    await expect(
      makeService(null).create('u1', {
        name: 'Groceries',
        type: 'EXPENSE',
      } as never),
    ).rejects.toBe(clash);
  });
});
