import { DraftSource } from '@prisma/client';
import { fakeAccess } from '../../../test/support/fake-account-access';
import {
  DRAFT_PUSH_WINDOW_MS,
  NotificationsService,
} from './notifications.service';
import { PushMessage, PushSender } from './push-sender';

class FakeSender extends PushSender {
  sent: PushMessage[] = [];
  gone: string[] = [];
  send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return Promise.resolve(this.gone);
  }
}

describe('NotificationsService', () => {
  function setup(devices: Array<{ expoToken: string }> = []) {
    const prisma = {
      pushDevice: {
        findMany: jest.fn().mockResolvedValue(devices),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };
    const access = fakeAccess();
    const sender = new FakeSender();
    const service = new NotificationsService(
      prisma as never,
      access as never,
      sender,
    );
    return { service, prisma, access, sender };
  }
  const mcpDraft = (userId = 'u1', client: string | null = 'Claude') => ({
    draftId: 'd',
    userId,
    source: DraftSource.MCP,
    sourceClient: client,
  });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  describe('MCP drafts', () => {
    it('pushes one notification for a burst of drafts, naming the app and the count', async () => {
      const { service, sender, prisma } = setup([{ expoToken: 'T1' }]);
      service.onDraftCreated(mcpDraft());
      service.onDraftCreated(mcpDraft());
      service.onDraftCreated(mcpDraft());
      await jest.advanceTimersByTimeAsync(DRAFT_PUSH_WINDOW_MS);

      expect(sender.sent).toEqual([
        {
          to: 'T1',
          title: 'New drafts to review',
          body: 'Claude added 3 draft transactions.',
          data: { url: '/drafts' },
        },
      ]);
      expect(prisma.pushDevice.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['u1'] },
          user: { isDemo: false, notifyMcpDrafts: true },
        },
        select: { expoToken: true },
      });
    });

    it('words a single draft in the singular and copes with an unnamed app', async () => {
      const { service, sender } = setup([{ expoToken: 'T1' }]);
      service.onDraftCreated(mcpDraft('u1', null));
      await jest.advanceTimersByTimeAsync(DRAFT_PUSH_WINDOW_MS);
      expect(sender.sent[0]).toMatchObject({
        title: 'New draft to review',
        body: 'A connected app added a draft transaction.',
      });
    });

    it('ignores drafts that did not come from a connected app', async () => {
      const { service, sender } = setup([{ expoToken: 'T1' }]);
      for (const source of [
        DraftSource.CHAT,
        DraftSource.VOICE,
        DraftSource.COMPOSER,
      ]) {
        service.onDraftCreated({ ...mcpDraft(), source });
      }
      await jest.advanceTimersByTimeAsync(DRAFT_PUSH_WINDOW_MS * 2);
      expect(sender.sent).toEqual([]);
    });

    it('starts a new window after a push, so later drafts notify again', async () => {
      const { service, sender } = setup([{ expoToken: 'T1' }]);
      service.onDraftCreated(mcpDraft());
      await jest.advanceTimersByTimeAsync(DRAFT_PUSH_WINDOW_MS);
      service.onDraftCreated(mcpDraft());
      await jest.advanceTimersByTimeAsync(DRAFT_PUSH_WINDOW_MS);
      expect(sender.sent).toHaveLength(2);
    });

    it('keeps users apart', async () => {
      const { service, prisma } = setup([{ expoToken: 'T1' }]);
      service.onDraftCreated(mcpDraft('u1'));
      service.onDraftCreated(mcpDraft('u2'));
      await jest.advanceTimersByTimeAsync(DRAFT_PUSH_WINDOW_MS);
      const asked = prisma.pushDevice.findMany.mock.calls.map(
        ([args]) =>
          (args as { where: { userId: { in: string[] } } }).where.userId.in,
      );
      expect(asked).toEqual([['u1'], ['u2']]);
    });
  });

  describe('recurring postings', () => {
    it('notifies everyone with access, with text that shows no amounts or names', async () => {
      const { service, sender, access, prisma } = setup([
        { expoToken: 'T1' },
        { expoToken: 'T2' },
      ]);
      access.usersWithAccess.mockResolvedValue(['owner', 'editor']);
      await service.onRecurringPosted({
        transactionId: 'tx1',
        parentTransactionId: 'root',
        accountIds: ['a1'],
      });

      expect(access.usersWithAccess).toHaveBeenCalledWith(['a1']);
      expect(prisma.pushDevice.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['owner', 'editor'] },
          user: { isDemo: false, notifyRecurring: true },
        },
        select: { expoToken: true },
      });
      expect(sender.sent.map((m) => m.to)).toEqual(['T1', 'T2']);
      expect(sender.sent[0]).toEqual({
        to: 'T1',
        title: 'Recurring transaction posted',
        body: 'A recurring transaction was added to your account.',
        data: { url: '/transactions/tx1' },
      });
    });

    it('sends nothing when nobody has a device', async () => {
      const { service, sender, access } = setup([]);
      access.usersWithAccess.mockResolvedValue(['owner']);
      await service.onRecurringPosted({
        transactionId: 'tx1',
        parentTransactionId: 'root',
        accountIds: ['a1'],
      });
      expect(sender.sent).toEqual([]);
    });

    it('never throws into the cron when the lookup or the push fails', async () => {
      const { service, access } = setup([{ expoToken: 'T1' }]);
      access.usersWithAccess.mockRejectedValue(new Error('db down'));
      await expect(
        service.onRecurringPosted({
          transactionId: 'tx1',
          parentTransactionId: 'root',
          accountIds: ['a1'],
        }),
      ).resolves.toBeUndefined();
    });
  });

  it('forgets the tokens the push service reports as gone', async () => {
    const { service, sender, prisma, access } = setup([{ expoToken: 'T1' }]);
    sender.gone = ['T1'];
    access.usersWithAccess.mockResolvedValue(['owner']);
    await service.onRecurringPosted({
      transactionId: 'tx1',
      parentTransactionId: 'root',
      accountIds: ['a1'],
    });
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { expoToken: { in: ['T1'] } },
    });
  });

  it('moves a device to whoever signed in last', async () => {
    const { service, prisma } = setup();
    await service.registerDevice('u2', {
      expoToken: 'ExponentPushToken[abc]',
      platform: 'android',
    });
    expect(prisma.pushDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { expoToken: 'ExponentPushToken[abc]' },
        update: expect.objectContaining({ userId: 'u2' }),
      }),
    );
  });

  it('only unregisters a token that belongs to the caller', async () => {
    const { service, prisma } = setup();
    await service.removeDevice('u1', 'T1');
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', expoToken: 'T1' },
    });
  });
});
