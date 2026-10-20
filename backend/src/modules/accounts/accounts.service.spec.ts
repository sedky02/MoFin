import { NotFoundException } from '@nestjs/common';
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

describe('AccountsService ownership checks', () => {
  const archived = { id: 'old', userId: 'u1', currency: 'EUR', archivedAt: new Date('2026-09-01T00:00:00Z') };
  const active = { id: 'main', userId: 'u1', currency: 'USD', archivedAt: null };

  // Applies the same where-clause Prisma would: id + userId, plus archivedAt: null when asked.
  function makeService() {
    const findFirst = jest.fn(async ({ where }: { where: { id: string; userId: string; archivedAt?: null } }) => {
      const found = [archived, active].find((a) => a.id === where.id && a.userId === where.userId);
      if (!found) return null;
      if ('archivedAt' in where && found.archivedAt) return null;
      return found;
    });
    const update = jest.fn(async () => ({}));
    const prisma = { account: { findFirst, update } };
    return { service: new AccountsService(prisma as never), update };
  }

  it('assertOwned lets reads through for an archived account', async () => {
    const { service } = makeService();
    await expect(service.assertOwned('u1', 'old')).resolves.toBe(archived);
  });

  it("assertOwned 404s for another user's account", async () => {
    const { service } = makeService();
    await expect(service.assertOwned('u2', 'old')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertActive 404s for an archived account', async () => {
    const { service } = makeService();
    await expect(service.assertActive('u1', 'old')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertActive returns an active account', async () => {
    const { service } = makeService();
    await expect(service.assertActive('u1', 'main')).resolves.toBe(active);
  });

  it('refuses to edit or re-archive an archived account', async () => {
    const { service, update } = makeService();
    await expect(service.update('u1', 'old', { name: 'Renamed' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.archive('u1', 'old')).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
