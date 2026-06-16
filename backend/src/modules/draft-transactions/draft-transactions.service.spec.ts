import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DraftStatus } from '@prisma/client';
import { DraftTransactionsService } from './draft-transactions.service';

describe('DraftTransactionsService state machine', () => {
  function makeService(draft: unknown) {
    const prisma = {
      draftTransaction: {
        findFirst: jest.fn(async () => draft),
        update: jest.fn(async () => ({})),
      },
    };
    const service = new DraftTransactionsService(prisma as never, {} as never, { emit: jest.fn() } as never);
    return { service, prisma };
  }

  it('throws NotFound when the draft does not exist', async () => {
    const { service } = makeService(null);
    await expect(service.approve('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reject('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only allows approving a PENDING draft', async () => {
    const { service } = makeService({ id: 'd1', status: DraftStatus.APPROVED });
    await expect(service.approve('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only allows rejecting a PENDING draft', async () => {
    const { service } = makeService({ id: 'd1', status: DraftStatus.REJECTED });
    await expect(service.reject('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a pending draft rejected with a reason', async () => {
    const { service, prisma } = makeService({ id: 'd1', status: DraftStatus.PENDING });
    await service.reject('u1', 'd1', 'duplicate');
    expect(prisma.draftTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DraftStatus.REJECTED, rejectionReason: 'duplicate' }),
      }),
    );
  });
});
