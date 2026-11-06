import { DraftSource, TransactionType } from '@prisma/client';
import { DraftTransactionsService } from './draft-transactions.service';

const DTO = {
  rawInput: 'coffee 4.5',
  parsedData: {
    type: TransactionType.EXPENSE,
    description: 'Coffee',
    amount: '4.5',
    currency: 'TND',
    occurredAt: '2026-11-05T10:00:00.000Z',
  },
  confidenceScore: 0.8,
};

function setup() {
  const create = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'd1', ...args.data }),
  );
  const prisma = {
    draftTransaction: {
      create,
      findMany: jest.fn(() => Promise.resolve([{ id: 'd1' }])),
      count: jest.fn(() => Promise.resolve(7)),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const events = { emit: jest.fn() };
  const service = new DraftTransactionsService(
    prisma as never,
    {} as never,
    events as never,
  );
  return { service, prisma, create, events };
}

const dataOf = (create: jest.Mock, i = 0) =>
  (create.mock.calls[i] as [{ data: Record<string, unknown> }])[0].data;

describe('DraftTransactionsService: where a draft came from', () => {
  it('records the Drafts page input when nothing else is said', async () => {
    const { service, create } = setup();
    await service.create('u1', DTO);
    expect(dataOf(create)).toMatchObject({
      source: DraftSource.COMPOSER,
      sourceClient: null,
    });
  });

  it('records MCP drafts with the connected app', async () => {
    const { service, create } = setup();
    await service.create('u1', DTO, {
      source: DraftSource.MCP,
      sourceClient: 'Claude',
    });
    expect(dataOf(create)).toMatchObject({
      source: DraftSource.MCP,
      sourceClient: 'Claude',
    });
  });

  it('labels every draft of one message the same way', async () => {
    const { service, create, events } = setup();
    await service.createMany('u1', [DTO, DTO], { source: DraftSource.VOICE });
    expect(create).toHaveBeenCalledTimes(2);
    expect(dataOf(create, 0).source).toBe(DraftSource.VOICE);
    expect(dataOf(create, 1).source).toBe(DraftSource.VOICE);
    expect(events.emit).toHaveBeenCalledTimes(2);
  });

  it("reads drafts by id only from the user's own", async () => {
    const { service, prisma } = setup();
    await service.findByIds('u1', ['d1', 'd2']);
    expect(prisma.draftTransaction.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', id: { in: ['d1', 'd2'] } },
    });
  });

  it('skips the query when there are no ids', async () => {
    const { service, prisma } = setup();
    await expect(service.findByIds('u1', [])).resolves.toEqual([]);
    expect(prisma.draftTransaction.findMany).not.toHaveBeenCalled();
  });

  it("counts the user's drafts in any state", async () => {
    const { service, prisma } = setup();
    await expect(service.countForUser('u1')).resolves.toBe(7);
    expect(prisma.draftTransaction.count).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });
});
