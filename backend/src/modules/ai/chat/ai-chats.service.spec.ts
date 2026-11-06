import { DraftStatus } from '@prisma/client';
import { AiChatsService } from './ai-chats.service';

const NOW = new Date('2026-11-05T10:00:00Z');

const message = (over: Record<string, unknown>) => ({
  id: 'm',
  chatId: 'chat-1',
  role: 'ASSISTANT',
  content: 'Drafted.',
  usedTools: ['create_draft_transaction'],
  charts: null,
  draftIds: [],
  createdAt: NOW,
  ...over,
});

const draft = (id: string, status: DraftStatus) => ({
  id,
  status,
  source: 'CHAT',
  parsedData: { description: 'Coffee' },
});

function setup(drafts: unknown[]) {
  const chat = {
    id: 'chat-1',
    userId: 'u1',
    title: 'Coffee',
    createdAt: NOW,
    updatedAt: NOW,
    messages: [
      message({ id: 'q', role: 'USER', content: 'coffee', usedTools: [] }),
      message({ id: 'a', draftIds: ['d1', 'gone'] }),
    ],
  };
  const prisma = {
    aiChat: { findFirst: jest.fn(() => Promise.resolve(chat)) },
  };
  const draftsService = {
    findByIds: jest.fn(() => Promise.resolve(drafts)),
  };
  const service = new AiChatsService(prisma as never, draftsService as never);
  return { service, draftsService };
}

describe('AiChatsService: drafts in a chat', () => {
  it('shows each draft as it is now, so a decision in the inbox shows here too', async () => {
    // Approved in the Drafts inbox after the chat created it.
    const { service, draftsService } = setup([
      draft('d1', DraftStatus.APPROVED),
    ]);

    const view = await service.get('u1', 'chat-1');

    expect(draftsService.findByIds).toHaveBeenCalledWith('u1', ['d1', 'gone']);
    expect(view.messages[1].drafts).toEqual([
      expect.objectContaining({ id: 'd1', status: DraftStatus.APPROVED }),
    ]);
  });

  it('leaves out a draft that no longer exists, and gives questions no drafts', async () => {
    const { service } = setup([draft('d1', DraftStatus.PENDING)]);

    const view = await service.get('u1', 'chat-1');

    expect(view.messages[0].drafts).toEqual([]);
    expect(view.messages[1].drafts.map((d) => d.id)).toEqual(['d1']);
  });
});
