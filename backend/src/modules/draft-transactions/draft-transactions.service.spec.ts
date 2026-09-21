import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DraftStatus, Prisma, TransactionType } from '@prisma/client';
import { DraftTransactionsService } from './draft-transactions.service';

const PARSED = {
  type: TransactionType.EXPENSE,
  description: 'Coffee',
  amount: '5',
  currency: 'USD',
  occurredAt: new Date().toISOString(),
  fromAccountId: 'acc1'
};

describe('DraftTransactionsService state machine', () => {
  function makeService(overrides: {
    draft?: unknown;
    findTransaction?: unknown;
    txUpdateManyCount?: number;
    createResult?: unknown;
    createImpl?: (...args: unknown[]) => unknown;
    paginateResult?: unknown;
    countResult?: number;
  }) {
    const draftInDb = { id: 'd1', status: DraftStatus.PENDING, parsedData: PARSED, ...( overrides.draft as object) };
    const txDraftTransaction = {
      updateMany: jest.fn(async () => ({ count: overrides.txUpdateManyCount ?? 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ ...draftInDb, status: DraftStatus.APPROVED }))
    };
    const db = { draftTransaction: txDraftTransaction };
    const paginate = jest.fn(async () => overrides.paginateResult ?? { data: [], total: 0, limit: 20, offset: 0 });
    const prisma = {
      draftTransaction: {
        findFirst: jest.fn(async () => overrides.draft === null ? null : draftInDb),
        update: jest.fn(async () => ({})),
        findUniqueOrThrow: jest.fn(async () => draftInDb),
        count: jest.fn(async () => overrides.countResult ?? 0)
      },
      transaction: {
        findUnique: jest.fn(async () => (overrides.findTransaction === undefined ? null : overrides.findTransaction))
      },
      paginated: { draftTransaction: { paginate } },
      $transaction: jest.fn(async (fn: (db: unknown) => unknown) => fn(db))
    };
    const transactionsService = {
      create: overrides.createImpl ?? jest.fn(async () => overrides.createResult ?? { id: 'tx1' })
    };
    const service = new DraftTransactionsService(prisma as never, transactionsService as never, { emit: jest.fn() } as never);
    return { service, prisma, transactionsService, db, paginate };
  }

  it('throws NotFound when the draft does not exist', async () => {
    const { service } = makeService({ draft: null });
    await expect(service.approve('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reject('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects approving an already-APPROVED draft with no matching transaction (genuinely broken state)', async () => {
    const { service } = makeService({ draft: { status: DraftStatus.APPROVED }, findTransaction: null });
    await expect(service.approve('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reconciles an already-APPROVED draft that does have a committed transaction, instead of erroring', async () => {
    const existingTx = { id: 'tx-existing', draftId: 'd1' };
    const { service } = makeService({ draft: { status: DraftStatus.APPROVED }, findTransaction: existingTx });
    const result = await service.approve('u1', 'd1');
    expect(result.transaction).toBe(existingTx);
  });

  it('only allows rejecting a PENDING draft', async () => {
    const { service } = makeService({ draft: { status: DraftStatus.REJECTED } });
    await expect(service.reject('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a pending draft rejected with a reason', async () => {
    const { service, prisma } = makeService({});
    await service.reject('u1', 'd1', 'duplicate');
    expect(prisma.draftTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DraftStatus.REJECTED, rejectionReason: 'duplicate' }),
      }),
    );
  });

  it('approves atomically: transaction creation and draft-status update happen inside the same $transaction', async () => {
    const { service, prisma, db } = makeService({});
    await service.approve('u1', 'd1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(db.draftTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: DraftStatus.PENDING },
      data: expect.objectContaining({ status: DraftStatus.APPROVED })
    });
  });

  it('passes the transaction db client into TransactionsService.create so it participates in the same commit', async () => {
    const { service, transactionsService, db } = makeService({});
    await service.approve('u1', 'd1');
    expect(transactionsService.create).toHaveBeenCalledWith('u1', expect.objectContaining({ draftId: 'd1' }), db);
  });

  it('loses the race safely when a concurrent approval already flipped the draft to APPROVED (updateMany affects 0 rows)', async () => {
    const { service, transactionsService } = makeService({ txUpdateManyCount: 0 });
    await expect(service.approve('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException);
    // Must not have gone on to create a transaction after losing the race.
    expect(transactionsService.create).not.toHaveBeenCalled();
  });

  it('heals a legacy-broken draft (stuck PENDING, but a transaction already exists) instead of throwing', async () => {
    const existingTx = { id: 'tx-existing', draftId: 'd1' };
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '0'
    });
    const { service, prisma } = makeService({
      createImpl: () => {
        throw p2002;
      },
      findTransaction: existingTx
    });

    const result = await service.approve('u1', 'd1');

    expect(result.transaction).toBe(existingTx);
    expect(prisma.draftTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd1' }, data: expect.objectContaining({ status: DraftStatus.APPROVED }) })
    );
  });

  it('still throws when creation fails with a unique constraint but no transaction actually exists for this draft', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '0'
    });
    const { service } = makeService({
      createImpl: () => {
        throw p2002;
      },
      findTransaction: null
    });

    await expect(service.approve('u1', 'd1')).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  describe('list', () => {
    it('returns the paginated shape from the extension, not a bare array', async () => {
      const page = { data: [{ id: 'd1' }, { id: 'd2' }], total: 25, limit: 2, offset: 0 };
      const { service, paginate } = makeService({ paginateResult: page });

      const result = await service.list('u1', { limit: 2, offset: 0 });

      expect(result).toBe(page);
      expect(result.total).toBe(25);
      expect(result.data).toHaveLength(2);
      expect(paginate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' }, limit: 2, offset: 0 }),
      );
    });

    it('filters by status when provided', async () => {
      const { service, paginate } = makeService({});
      await service.list('u1', { limit: 20, offset: 0, status: DraftStatus.PENDING });
      expect(paginate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', status: DraftStatus.PENDING } }),
      );
    });
  });

  describe('countPending', () => {
    it('counts only this user\'s PENDING drafts — a single COUNT(*), not a row fetch', async () => {
      const { service, prisma } = makeService({ countResult: 7 });
      const count = await service.countPending('u1');
      expect(count).toBe(7);
      expect(prisma.draftTransaction.count).toHaveBeenCalledWith({
        where: { userId: 'u1', status: DraftStatus.PENDING },
      });
    });
  });
});
