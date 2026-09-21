import { AccountsService } from './accounts.service';

describe('AccountsService.list', () => {
  function makeService(paginateResult: unknown) {
    const paginate = jest.fn(async () => paginateResult);
    const prisma = { paginated: { account: { paginate } } };
    return { service: new AccountsService(prisma as never), paginate };
  }

  it('returns the paginated shape — total reflects the full match count, not just this page', async () => {
    const page = { data: [{ id: 'a1' }, { id: 'a2' }], total: 12, limit: 2, offset: 0 };
    const { service, paginate } = makeService(page);

    const result = await service.list('u1', { status: 'active', limit: 2, offset: 0 });

    expect(result).toBe(page);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(12);
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', archivedAt: null }, limit: 2, offset: 0 }),
    );
  });

  it('filters to archived accounts only when status=archived', async () => {
    const { service, paginate } = makeService({ data: [], total: 0, limit: 20, offset: 0 });
    await service.list('u1', { status: 'archived', limit: 20, offset: 0 });
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', archivedAt: { not: null } } }),
    );
  });

  it('applies no archived filter when status=all', async () => {
    const { service, paginate } = makeService({ data: [], total: 0, limit: 20, offset: 0 });
    await service.list('u1', { status: 'all', limit: 20, offset: 0 });
    expect(paginate).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
  });
});
