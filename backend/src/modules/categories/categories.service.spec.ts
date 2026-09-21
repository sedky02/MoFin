import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService.isSystem', () => {
  function makeService(overrides: {
    findMany?: unknown[];
    create?: unknown;
    update?: unknown;
    findFirst?: unknown;
  }) {
    const prisma = {
      category: {
        findMany: jest.fn(async () => overrides.findMany ?? []),
        create: jest.fn(async () => overrides.create ?? {}),
        update: jest.fn(async () => overrides.update ?? {}),
        findFirst: jest.fn(async () => (overrides.findFirst === undefined ? null : overrides.findFirst)),
      },
    };
    return { service: new CategoriesService(prisma as never), prisma };
  }

  it('list() marks a userId:null row as isSystem:true and the caller\'s own row as isSystem:false', async () => {
    const { service } = makeService({
      findMany: [
        { id: 'c1', userId: 'u1', name: 'Coffee' },
        { id: 'c2', userId: null, name: 'Groceries' },
      ],
    });
    const result = await service.list('u1');
    expect(result).toEqual([
      { id: 'c1', userId: 'u1', name: 'Coffee', isSystem: false },
      { id: 'c2', userId: null, name: 'Groceries', isSystem: true },
    ]);
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
