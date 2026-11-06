import { BadRequestException } from '@nestjs/common';
import { demoEmail } from '../../common/utils/demo-identity';
import { AiChatService, MAX_TOOL_ROUNDS } from './ai-chat.service';
import {
  buildChatTools,
  compactToolResult,
  MAX_TOOL_RESULT_CHARS,
} from './ai-chat-tools';
import { MAX_MESSAGES_PER_CHAT } from './chat/chat-context';
import { ChatToolRunner } from './chat/chat-tool-runner';
import { MAX_CHARTS_PER_REPLY } from './chat/chart-tools';
import { AiUnavailableException } from './llm/ai-unavailable.exception';

const USER_ID = 'u1';
const NOW = new Date('2026-11-05T10:00:00Z');

type Msg = { role: string; content?: string | null; toolCallId?: string };
type ChatCall = [{ messages: Msg[]; tools?: Array<{ name: string }> }];

const answer = (content: string) => Promise.resolve({ content, toolCalls: [] });
const toolCalls = (...calls: Array<[string, unknown?]>) =>
  Promise.resolve({
    content: null,
    toolCalls: calls.map(([name, args], i) => ({
      id: `c${i + 1}`,
      name,
      arguments: JSON.stringify(args ?? {}),
    })),
  });

function storedChat(messageCount: number, over: Record<string, unknown> = {}) {
  return {
    id: 'chat-1',
    userId: USER_ID,
    title: 'Old chat',
    summary: null,
    summarizedCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    messages: Array.from({ length: messageCount }, (_, i) => ({
      id: `m${i}`,
      chatId: 'chat-1',
      role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
      content: `message ${i}`,
      usedTools: [],
      charts: null,
      draftIds: [],
      createdAt: NOW,
    })),
    ...over,
  };
}

function setup(chat: jest.Mock, enabled = true) {
  const mcp = { dispatch: jest.fn(() => Promise.resolve({ ok: true })) };
  const categories = {
    list: jest.fn(() =>
      Promise.resolve({
        data: [{ id: 'cat1', name: 'Food', type: 'EXPENSE', color: '#fff' }],
        total: 1,
      }),
    ),
  };
  const analytics = {
    getMonthlySummary: jest.fn(() =>
      Promise.resolve({
        categoryBreakdown: [
          { category: 'Food', amount: '120' },
          { category: 'Rent', amount: '800' },
        ],
        incomeBreakdown: [],
      }),
    ),
    getMonthlySeries: jest.fn(() =>
      Promise.resolve({
        currency: 'TND',
        points: [
          { month: '2026-10', income: '1000', expenses: '700', balance: '0' },
          { month: '2026-11', income: '1000', expenses: '900', balance: '0' },
        ],
      }),
    ),
    getDailySeries: jest.fn(() =>
      Promise.resolve({ currency: 'TND', timeZone: 'UTC', points: [] }),
    ),
  };
  const accounts = {
    list: jest.fn(() =>
      Promise.resolve({
        data: [{ id: 'acc-1', name: 'Checking', currency: 'TND' }],
        total: 1,
      }),
    ),
  };
  const chats = {
    loadForReply: jest.fn(),
    saveTurn: jest.fn(
      (
        _userId: string,
        chatId: string | null,
        title: string,
        question: { content: string; askedAt: Date },
        reply: {
          content: string;
          usedTools: string[];
          charts: unknown[];
          draftIds: string[];
        },
      ) =>
        Promise.resolve({
          chat: {
            id: chatId ?? 'new-chat',
            title,
            createdAt: NOW,
            updatedAt: NOW,
          },
          asked: {
            id: 'q',
            role: 'USER',
            content: question.content,
            usedTools: [],
            charts: null,
            draftIds: [],
            createdAt: question.askedAt,
          },
          answered: {
            id: 'a',
            role: 'ASSISTANT',
            content: reply.content,
            usedTools: reply.usedTools,
            charts: reply.charts,
            draftIds: reply.draftIds,
            createdAt: NOW,
          },
        }),
    ),
    saveSummary: jest.fn(() => Promise.resolve()),
  };
  const drafts = {
    createMany: jest.fn(
      (
        _userId: string,
        dtos: Array<Record<string, unknown>>,
        origin: { source: string },
      ) =>
        Promise.resolve(
          dtos.map((dto, i) => ({
            id: `draft-${i + 1}`,
            status: 'PENDING',
            source: origin.source,
            ...dto,
          })),
        ),
    ),
    countForUser: jest.fn(() => Promise.resolve(0)),
  };
  const draftParser = {
    draftContext: jest.fn(
      (_userId: string, dto: { input: string; timeZone?: string }) =>
        Promise.resolve({
          input: dto.input,
          accounts: [
            { id: 'acc-1', name: 'Checking', type: 'BANK', currency: 'TND' },
          ],
          categories: [{ id: 'cat1', name: 'Food', type: 'EXPENSE' }],
          timeZone: dto.timeZone ?? 'UTC',
          today: '2026-11-05',
          now: NOW,
        }),
    ),
  };
  const config = { getOrThrow: jest.fn(() => 3) };
  const runner = new ChatToolRunner(
    mcp as never,
    categories as never,
    analytics as never,
    drafts as never,
    draftParser as never,
    config as never,
  );
  const service = new AiChatService(
    { enabled, chat },
    chats as never,
    runner,
    accounts as never,
  );
  const call = (i: number) => (chat.mock.calls[i] as ChatCall)[0];
  return { service, mcp, categories, analytics, chats, drafts, call };
}

const USER = { id: USER_ID, email: 'real@example.com' };
const DEMO = { id: USER_ID, email: demoEmail('visitor') };

const ask = (
  content = 'how much did I spend?',
  timeZone?: string,
  inputMode: 'text' | 'voice' = 'text',
) => ({ content, timeZone, inputMode });

describe('AiChatService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('answers 503 AI_UNAVAILABLE when no key is configured', async () => {
    const { service } = setup(jest.fn(), false);
    await expect(service.send(USER, null, ask())).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
  });

  it('starts a chat: runs a tool, saves both turns, titles it from the question', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() =>
        toolCalls([
          'get_monthly_summary',
          { year: 2026, month: 11, currency: 'TND' },
        ]),
      )
      .mockImplementationOnce(() => answer('You spent 120 TND.'));
    const { service, mcp, chats, call } = setup(chat);

    const turn = await service.send(USER, null, ask());

    expect(turn.chat).toMatchObject({
      id: 'new-chat',
      title: 'how much did I spend?',
    });
    expect(turn.messages[0]).toMatchObject({
      role: 'user',
      content: 'how much did I spend?',
    });
    expect(turn.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'You spent 120 TND.',
      usedTools: ['get_monthly_summary'],
      charts: [],
    });
    expect(chats.saveTurn).toHaveBeenCalledTimes(1);
    expect((chats.saveTurn.mock.calls[0] as unknown[])[1]).toBeNull();
    expect(mcp.dispatch).toHaveBeenCalledWith(
      USER_ID,
      'get_monthly_summary',
      expect.objectContaining({ year: 2026, month: 11 }),
    );
    expect(call(1).messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ]);
  });

  it('saves nothing when the model fails', async () => {
    const chat = jest.fn(() => Promise.reject(new AiUnavailableException()));
    const { service, chats } = setup(chat);

    await expect(service.send(USER, null, ask())).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
    expect(chats.saveTurn).not.toHaveBeenCalled();
  });

  it("answers in the chat's context: earlier messages and the summary", async () => {
    const chat = jest.fn(() => answer('ok'));
    const { service, chats, call } = setup(chat);
    chats.loadForReply.mockResolvedValue(
      storedChat(4, { summary: 'They asked about rent.', summarizedCount: 2 }),
    );

    await service.send(USER, 'chat-1', ask('and last month?'));

    expect(chats.loadForReply).toHaveBeenCalledWith(USER_ID, 'chat-1');
    const { messages } = call(0);
    expect(messages[0].content).toContain(
      'Summary of the earlier part of this chat: They asked about rent.',
    );
    // Messages 0-1 are in the summary; 2-3 come verbatim, then the question.
    expect(messages.slice(1).map((m) => m.content)).toEqual([
      'message 2',
      'message 3',
      'and last month?',
    ]);
  });

  it("puts today's date in the user's time zone in the prompt", async () => {
    // 05:00 UTC on Nov 5 is 19:00 on Nov 4 in Honolulu (UTC-10).
    jest.setSystemTime(new Date('2026-11-05T05:00:00Z'));
    const chat = jest.fn(() => answer('ok'));
    const { service, call } = setup(chat);

    await service.send(USER, null, ask('hi', 'Pacific/Honolulu'));

    expect(call(0).messages[0].content).toContain('Today is 2026-11-04');
  });

  it('refuses a chat that is full', async () => {
    const { service, chats } = setup(jest.fn());
    chats.loadForReply.mockResolvedValue(storedChat(MAX_MESSAGES_PER_CHAT));

    await expect(service.send(USER, 'chat-1', ask())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('create_draft_transaction', () => {
    const coffee = {
      type: 'EXPENSE',
      description: 'Coffee',
      amount: '4.5',
      currency: 'TND',
      fromAccountId: 'acc-1',
      categoryId: 'cat1',
    };

    it('makes a pending CHAT draft and returns it with the answer, never a transaction', async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() =>
          toolCalls(['create_draft_transaction', coffee]),
        )
        .mockImplementationOnce(() => answer('Drafted. Approve it below.'));
      const { service, mcp, chats, drafts, call } = setup(chat);

      const turn = await service.send(USER, null, ask('coffee 4.5 today'));

      // Through the drafts service, not MCP dispatch, and labelled as chat.
      expect(mcp.dispatch).not.toHaveBeenCalled();
      expect(drafts.createMany).toHaveBeenCalledWith(
        USER_ID,
        [
          expect.objectContaining({
            rawInput: 'coffee 4.5 today',
            parsedData: expect.objectContaining({
              amount: '4.5',
              fromAccountId: 'acc-1',
            }),
          }),
        ],
        { source: 'CHAT' },
      );
      expect(turn.messages[1].drafts).toEqual([
        expect.objectContaining({
          id: 'draft-1',
          status: 'PENDING',
          source: 'CHAT',
        }),
      ]);
      // Saved as ids, so the chat reads the draft's current state later.
      const saved = (chats.saveTurn.mock.calls[0] as unknown[])[4] as {
        draftIds: string[];
      };
      expect(saved.draftIds).toEqual(['draft-1']);
      expect(call(1).messages.at(-1)?.content).toContain('"created":true');
    });

    it('labels drafts from a spoken question as voice', async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() =>
          toolCalls(['create_draft_transaction', coffee]),
        )
        .mockImplementationOnce(() => answer('Drafted.'));
      const { service, drafts } = setup(chat);

      await service.send(USER, null, ask('coffee 4.5', undefined, 'voice'));

      expect(drafts.createMany).toHaveBeenCalledWith(
        USER_ID,
        expect.any(Array),
        { source: 'VOICE' },
      );
    });

    it("drops an account id that isn't the user's and lowers the confidence", async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() =>
          toolCalls([
            'create_draft_transaction',
            { ...coffee, fromAccountId: 'someone-elses' },
          ]),
        )
        .mockImplementationOnce(() => answer('Drafted.'));
      const { service, drafts } = setup(chat);

      await service.send(USER, null, ask());

      const [dto] = (
        drafts.createMany.mock.calls[0] as unknown as [
          string,
          Array<{
            parsedData: { fromAccountId?: string };
            confidenceScore: number;
          }>,
        ]
      )[1];
      expect(dto.parsedData.fromAccountId).toBeUndefined();
      expect(dto.confidenceScore).toBeLessThanOrEqual(0.5);
    });

    it('returns invalid arguments to the model instead of drafting', async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() =>
          toolCalls(['create_draft_transaction', { description: 'no amount' }]),
        )
        .mockImplementationOnce(() => answer('Sorry.'));
      const { service, drafts, call } = setup(chat);

      const turn = await service.send(USER, null, ask());

      expect(drafts.createMany).not.toHaveBeenCalled();
      expect(turn.messages[1].drafts).toEqual([]);
      expect(call(1).messages.at(-1)?.content).toContain('Invalid arguments');
    });

    it('keeps a demo visitor within the AI draft cap', async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() =>
          toolCalls(['create_draft_transaction', coffee]),
        )
        .mockImplementationOnce(() => answer('The demo is out of drafts.'));
      const { service, drafts, call } = setup(chat);
      drafts.countForUser.mockResolvedValueOnce(3);

      await service.send(DEMO, null, ask());

      expect(drafts.createMany).not.toHaveBeenCalled();
      expect(call(1).messages.at(-1)?.content).toContain(
        'demo allows 3 drafts',
      );
    });
  });

  it('offers the read tools, the chart tools and the draft tool', () => {
    const names = buildChatTools().map((t) => t.name);
    expect(names).toContain('create_draft_transaction');
    expect(names).not.toContain('list_accounts');
    expect(names).toEqual(
      expect.arrayContaining([
        'get_monthly_summary',
        'list_categories',
        'chart_spending_by_category',
        'chart_income_vs_expenses',
        'chart_daily_trend',
      ]),
    );
  });

  it('does not let the model force a summary recompute', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() =>
        toolCalls([
          'get_monthly_summary',
          { year: 2026, month: 11, currency: 'TND', refresh: true },
        ]),
      )
      .mockImplementationOnce(() => answer('ok'));
    const { service, mcp } = setup(chat);

    await service.send(USER, null, ask());

    expect(mcp.dispatch).toHaveBeenCalledWith(
      USER_ID,
      'get_monthly_summary',
      expect.objectContaining({ refresh: false }),
    );
    const summaryTool = buildChatTools().find(
      (t) => t.name === 'get_monthly_summary',
    );
    expect(summaryTool?.parameters.properties).not.toHaveProperty('refresh');
  });

  it('returns invalid arguments to the model instead of dispatching', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() =>
        toolCalls(['get_monthly_summary', { year: 'soon' }]),
      )
      .mockImplementationOnce(() => answer('Sorry.'));
    const { service, mcp, call } = setup(chat);

    await service.send(USER, null, ask());

    expect(mcp.dispatch).not.toHaveBeenCalled();
    expect(call(1).messages.at(-1)?.content).toContain('Invalid arguments');
  });

  it('runs the tool calls of one round together and keeps their order', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() =>
        toolCalls(['list_goals', {}], ['list_categories', {}]),
      )
      .mockImplementationOnce(() => answer('ok'));
    const { service, call } = setup(chat);

    await service.send(USER, null, ask());

    const tools = call(1).messages.filter((m) => m.role === 'tool');
    expect(tools.map((m) => m.toolCallId)).toEqual(['c1', 'c2']);
  });

  it('stops after MAX_TOOL_ROUNDS and asks for a final answer without tools', async () => {
    const chat = jest.fn((request: { tools?: unknown[] }) =>
      request.tools ? toolCalls(['list_goals']) : answer('Best I can do.'),
    );
    const { service } = setup(chat);

    const turn = await service.send(USER, null, ask());

    expect(chat).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
    expect(turn.messages[1].content).toBe('Best I can do.');
  });

  it('serves list_categories from the categories service', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() => toolCalls(['list_categories', {}]))
      .mockImplementationOnce(() => answer('Food.'));
    const { service, categories, call } = setup(chat);

    await service.send(USER, null, ask());

    expect(categories.list).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ limit: 20 }),
    );
    // Only id, name and type reach the model.
    expect(call(1).messages.at(-1)?.content).not.toContain('#fff');
  });

  describe('charts', () => {
    it('attaches a chart computed from the ledger, and tells the model about it', async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() =>
          toolCalls([
            'chart_spending_by_category',
            { year: 2026, month: 11, currency: 'TND' },
          ]),
        )
        .mockImplementationOnce(() => answer('Rent is your biggest cost.'));
      const { service, analytics, call } = setup(chat);

      const turn = await service.send(USER, null, ask());

      expect(analytics.getMonthlySummary).toHaveBeenCalledWith(
        USER_ID,
        2026,
        11,
        false,
        undefined,
        'TND',
      );
      expect(turn.messages[1].charts).toEqual([
        expect.objectContaining({
          kind: 'donut',
          currency: 'TND',
          labels: ['Rent', 'Food'],
          series: [expect.objectContaining({ values: ['800', '120'] })],
        }),
      ]);
      const told = JSON.parse(call(1).messages.at(-1)?.content ?? '{}') as {
        shownToUser: boolean;
      };
      expect(told.shownToUser).toBe(true);
    });

    it(`keeps at most ${MAX_CHARTS_PER_REPLY} charts per answer`, async () => {
      const bars = ['chart_income_vs_expenses', { currency: 'TND' }] as [
        string,
        unknown,
      ];
      const chat = jest
        .fn()
        .mockImplementationOnce(() => toolCalls(bars, bars, bars, bars))
        .mockImplementationOnce(() => answer('Here.'));
      const { service, call } = setup(chat);

      const turn = await service.send(USER, null, ask());

      expect(turn.messages[1].charts).toHaveLength(MAX_CHARTS_PER_REPLY);
      expect(call(1).messages.at(-1)?.content).toContain('limit');
    });

    it('treats a chart of only zeros as nothing to chart', async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() =>
          toolCalls(['chart_income_vs_expenses', { currency: 'TND' }]),
        )
        .mockImplementationOnce(() => answer('No activity.'));
      const { service, analytics, call } = setup(chat);
      analytics.getMonthlySeries.mockResolvedValueOnce({
        currency: 'TND',
        points: [
          { month: '2026-10', income: '0', expenses: '0', balance: '0' },
          { month: '2026-11', income: '0', expenses: '0', balance: '0' },
        ],
      });

      const turn = await service.send(USER, null, ask());

      expect(turn.messages[1].charts).toEqual([]);
      expect(call(1).messages.at(-1)?.content).toContain('No activity');
    });

    it('tells the model when there is nothing to chart', async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() =>
          toolCalls(['chart_daily_trend', { currency: 'TND' }]),
        )
        .mockImplementationOnce(() => answer('No activity.'));
      const { service, analytics, call } = setup(chat);

      const turn = await service.send(USER, null, ask());

      expect(analytics.getDailySeries).toHaveBeenCalled();
      expect(turn.messages[1].charts).toEqual([]);
      expect(call(1).messages.at(-1)?.content).toContain('No activity');
    });
  });

  describe('running summary', () => {
    it('folds messages that left the recent window into the summary', async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() => answer('the answer'))
        .mockImplementationOnce(() => answer('New summary.'));
      const { service, chats, call } = setup(chat);
      // 8 saved + 2 new = 10; the last 6 stay verbatim, so 0-3 are folded.
      chats.loadForReply.mockResolvedValue(storedChat(8));

      await service.send(USER, 'chat-1', ask());

      expect(chat).toHaveBeenCalledTimes(2);
      expect(call(1).messages[1].content).toContain('message 3');
      expect(call(1).messages[1].content).not.toContain('message 4');
      expect(chats.saveSummary).toHaveBeenCalledWith(
        'chat-1',
        'New summary.',
        4,
      );
    });

    it('waits until a batch has piled up', async () => {
      const chat = jest.fn(() => answer('ok'));
      const { service, chats } = setup(chat);
      chats.loadForReply.mockResolvedValue(storedChat(6));

      await service.send(USER, 'chat-1', ask());

      expect(chat).toHaveBeenCalledTimes(1);
      expect(chats.saveSummary).not.toHaveBeenCalled();
    });

    it('still returns the answer when the summary call fails', async () => {
      const chat = jest
        .fn()
        .mockImplementationOnce(() => answer('the answer'))
        .mockImplementationOnce(() =>
          Promise.reject(new AiUnavailableException()),
        );
      const { service, chats } = setup(chat);
      chats.loadForReply.mockResolvedValue(storedChat(8));

      const turn = await service.send(USER, 'chat-1', ask());

      expect(turn.messages[1].content).toBe('the answer');
      expect(chats.saveSummary).not.toHaveBeenCalled();
    });
  });
});

describe('compactToolResult', () => {
  it('drops noisy fields', () => {
    const text = compactToolResult({
      id: 'a',
      userId: 'u',
      createdAt: 'x',
      name: 'n',
    });
    expect(JSON.parse(text)).toEqual({ id: 'a', name: 'n' });
  });

  it('trims rows from a large page and flags it as truncated', () => {
    const data = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      description: 'x'.repeat(50),
    }));
    const text = compactToolResult({ data, total: 200 });

    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
    const parsed = JSON.parse(text) as {
      truncated: boolean;
      data: unknown[];
      total: number;
    };
    expect(parsed.truncated).toBe(true);
    expect(parsed.total).toBe(200);
    expect(parsed.data.length).toBeLessThan(200);
  });
});
