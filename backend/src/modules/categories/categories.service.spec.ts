import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
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
        findFirst: jest.fn(async () => (overrides.findFirst === undefined ? null : overrides.findFirst)),
      },
      paginated: { category: { paginate } },
    };
    return { service: new CategoriesService(prisma as never), prisma, paginate };
  }

  it('list() marks a userId:null row as isSystem:true and the caller\'s own row as isSystem:false', async () => {
    const { service } = makeService({
      paginateResult: [
        { id: 'c1', userId: 'u1', name: 'Coffee' },
        { id: 'c2', userId: null, name: 'Groceries' },
      ],
    });
    const result = await service.list('u1', { limit: 20, offset: 0 });
    expect(result.data).toEqual([
      { id: 'c1', userId: 'u1', name: 'Coffee', isSystem: false },
      { id: 'c2', userId: null, name: 'Groceries', isSystem: true },
    ]);
    expect(result.total).toBe(2);
  });

  it('list() forwards limit/offset to the pagination extension', async () => {
    const { service, paginate } = makeService({});
    await service.list('u1', { limit: 5, offset: 10 });
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ userId: 'u1' }, { userId: null }] }, limit: 5, offset: 10 }),
    );
  });

  it('create() returns isSystem:false for the always user-owned created category', async () => {
    const { service } = makeService({ create: { id: 'c1', userId: 'u1', name: 'New' } });
    const result = await service.create('u1', { name: 'New', type: 'EXPENSE' } as never);
    expect(result).toEqual({ id: 'c1', userId: 'u1', name: 'New', isSystem: false });
  });

  it('update() includes isSystem on the returned row', async () => {
    const { service } = makeService({
      findFirst: { id: 'c1', userId: 'u1' },
      update: { id: 'c1', userId: 'u1', name: 'Renamed' },
    });
    const result = await service.update('u1', 'c1', { name: 'Renamed' } as never);
    expect(result).toEqual({ id: 'c1', userId: 'u1', name: 'Renamed', isSystem: false });
  });

  it('update() still rejects a category it does not own (e.g. a global/userId:null one) — that 404 stays as defence in depth', async () => {
    const { service } = makeService({ findFirst: null });
    await expect(service.update('u1', 'global-cat', { name: 'Nope' } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CategoriesService.assertAssignable', () => {
  function makeService(found: unknown) {
    const findFirst = jest.fn(async () => found);
    const service = new CategoriesService({ category: { findFirst } } as never);
    return { service, findFirst };
  }

  const groceries = { id: 'c-groceries', userId: null, name: 'Groceries', type: 'EXPENSE' };
  const salary = { id: 'c-salary', userId: 'u1', name: 'Salary', type: 'INCOME' };

  it('returns null without a lookup when no category is given', async () => {
    const { service, findFirst } = makeService(groceries);
    await expect(service.assertAssignable('u1', TransactionType.INCOME, undefined)).resolves.toBeNull();
    await expect(service.assertAssignable('u1', TransactionType.TRANSFER, null)).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('accepts a category whose type matches the transaction', async () => {
    const { service } = makeService(salary);
    await expect(service.assertAssignable('u1', TransactionType.INCOME, 'c-salary')).resolves.toEqual(salary);
  });

  it('rejects an expense category on an income transaction with a domain message', async () => {
    const { service } = makeService(groceries);
    const result = service.assertAssignable('u1', TransactionType.INCOME, 'c-groceries');
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(
      '"Groceries" is an expense category and cannot be used on an income transaction',
    );
  });

  it('rejects an income category on an expense transaction', async () => {
    const { service } = makeService(salary);
    await expect(service.assertAssignable('u1', TransactionType.EXPENSE, 'c-salary')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects any category on a transfer, before looking it up', async () => {
    const { service, findFirst } = makeService(groceries);
    const result = service.assertAssignable('u1', TransactionType.TRANSFER, 'c-groceries');
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow('Transfers cannot have a category');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('still 404s a category the user cannot see', async () => {
    const { service } = makeService(null);
    await expect(service.assertAssignable('u1', TransactionType.EXPENSE, 'someone-elses')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
