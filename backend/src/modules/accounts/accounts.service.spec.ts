import { NotFoundException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { accountScope } from '../account-access/account-access';
import { AccountAccessService } from '../account-access/account-access.service';
import { AccountsService } from './accounts.service';
import { createAccountSchema, updateAccountSchema } from './dto/accounts.dto';

describe('AccountsService.list', () => {
  function makeService(paginateResult: unknown) {
    const paginate = jest.fn(async () => paginateResult);
    const prisma = { paginated: { account: { paginate } } };
    const service = new AccountsService(
      prisma as never,
      new AccountAccessService(prisma as never),
    );
    return { service, paginate };
  }

  it('returns the paginated shape — total reflects the full match count, not just this page', async () => {
    const owned = (id: string) => ({
      id,
      userId: 'u1',
      metadata: {},
      members: [],
      user: { displayName: 'Me' },
      _count: { members: 0 },
    });
    const page = {
      data: [owned('a1'), owned('a2')],
      total: 12,
      limit: 2,
      offset: 0,
    };
    const { service, paginate } = makeService(page);

    const result = await service.list('u1', {
      status: 'active',
      limit: 2,
      offset: 0,
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(12);
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...accountScope('u1', 'view'), archivedAt: null },
        limit: 2,
        offset: 0,
      }),
    );
  });

  it('filters to archived accounts only when status=archived', async () => {
    const { service, paginate } = makeService({
      data: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    await service.list('u1', { status: 'archived', limit: 20, offset: 0 });
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...accountScope('u1', 'view'), archivedAt: { not: null } },
      }),
    );
  });

  it('applies no archived filter when status=all', async () => {
    const { service, paginate } = makeService({
      data: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    await service.list('u1', { status: 'all', limit: 20, offset: 0 });
    expect(paginate).toHaveBeenCalledWith(
      expect.objectContaining({ where: accountScope('u1', 'view') }),
    );
  });
});

describe('AccountsService ownership checks', () => {
  const archived = {
    id: 'old',
    userId: 'u1',
    currency: 'EUR',
    archivedAt: new Date('2026-09-01T00:00:00Z'),
  };
  const active = {
    id: 'main',
    userId: 'u1',
    currency: 'USD',
    archivedAt: null,
  };

  // Applies what matters here of the where-clause Prisma would: archivedAt: null when asked.
  function makeService() {
    const findFirst = jest.fn(
      async ({ where }: { where: { id: string; archivedAt?: null } }) => {
        const found = [archived, active].find((a) => a.id === where.id);
        if (!found) return null;
        if ('archivedAt' in where && found.archivedAt) return null;
        return { ...found, members: [] };
      },
    );
    const update = jest.fn(async () => ({}));
    const prisma = { account: { findFirst, update } };
    const service = new AccountsService(
      prisma as never,
      new AccountAccessService(prisma as never),
    );
    return { service, update };
  }

  it('refuses to edit or re-archive an archived account', async () => {
    const { service, update } = makeService();
    await expect(
      service.update('u1', 'old', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.archive('u1', 'old')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AccountsService opening balance', () => {
  function makeService() {
    const create = jest.fn(async (args: { data: unknown }) => args.data);
    const update = jest.fn(async (args: { data: unknown }) => args.data);
    const findFirst = jest.fn(async () => ({
      id: 'a1',
      userId: 'u1',
      currency: 'USD',
      archivedAt: null,
      members: [],
    }));
    const prisma = { account: { create, update, findFirst } };
    const service = new AccountsService(
      prisma as never,
      new AccountAccessService(prisma as never),
    );
    return { service, create, update };
  }

  it('stores an opening balance given on create as a Decimal', async () => {
    const { service, create } = makeService();
    await service.create('u1', {
      name: 'Checking',
      type: AccountType.BANK,
      currency: 'USD',
      openingBalance: '5000',
    });
    const { data } = create.mock.calls[0][0] as {
      data: { openingBalance: Prisma.Decimal; userId: string };
    };
    expect(data.userId).toBe('u1');
    expect(data.openingBalance).toEqual(new Prisma.Decimal('5000'));
  });

  it("leaves it to the column's default (0) when create omits it", async () => {
    const { service, create } = makeService();
    await service.create('u1', {
      name: 'Cash',
      type: AccountType.CASH,
      currency: 'TND',
    });
    const { data } = create.mock.calls[0][0] as {
      data: { openingBalance?: unknown };
    };
    expect(data.openingBalance).toBeUndefined();
  });

  it('edits the opening balance, and leaves it alone when an edit omits it', async () => {
    const { service, update } = makeService();
    await service.update('u1', 'a1', { openingBalance: '-1250.500' });
    await service.update('u1', 'a1', { name: 'Renamed' });
    const [first, second] = update.mock.calls.map(
      (c) => (c[0] as { data: { openingBalance?: Prisma.Decimal } }).data,
    );
    expect(first.openingBalance).toEqual(new Prisma.Decimal('-1250.5'));
    expect(second.openingBalance).toBeUndefined();
  });
});

describe('account DTOs: openingBalance', () => {
  const base = { name: 'Card', type: AccountType.BANK, currency: 'TND' };

  it('is optional on create', () => {
    expect(createAccountSchema.safeParse(base).success).toBe(true);
  });

  it.each(['5000', '0', '-1250.500', '1234.5678'])(
    'accepts %s',
    (openingBalance) => {
      expect(
        createAccountSchema.safeParse({ ...base, openingBalance }).success,
      ).toBe(true);
      expect(updateAccountSchema.safeParse({ openingBalance }).success).toBe(
        true,
      );
    },
  );

  it.each(['12,50', '1e3', '--5', '+5', 'abc', '', '5.'])(
    'rejects %s',
    (openingBalance) => {
      expect(
        createAccountSchema.safeParse({ ...base, openingBalance }).success,
      ).toBe(false);
      expect(updateAccountSchema.safeParse({ openingBalance }).success).toBe(
        false,
      );
    },
  );

  it('is a string, never a number (precision)', () => {
    expect(
      createAccountSchema.safeParse({ ...base, openingBalance: 5000 }).success,
    ).toBe(false);
  });
});
