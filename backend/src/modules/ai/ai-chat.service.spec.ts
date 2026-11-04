import { HttpException } from '@nestjs/common';
import { AiChatService, MAX_TOOL_ROUNDS } from './ai-chat.service';
import {
  buildChatTools,
  compactToolResult,
  MAX_TOOL_RESULT_CHARS,
} from './ai-chat-tools';
import { AiUnavailableException } from './llm/ai-unavailable.exception';

const USER = { id: 'u1', email: 'real@example.com' };
const DEMO = { id: 'u2', email: 'demo-x@demo.mofin.invalid' };
const dto = (text = 'how much did I spend?') => ({
  messages: [{ role: 'user' as const, content: text }],
});

const answer = (content: string) => Promise.resolve({ content, toolCalls: [] });
const toolCall = (name: string, args: unknown = {}, id = 'c1') =>
  Promise.resolve({
    content: null,
    toolCalls: [{ id, name, arguments: JSON.stringify(args) }],
  });

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
  const config = { getOrThrow: jest.fn(() => 2) };
  const service = new AiChatService(
    { enabled, chat },
    mcp as never,
    categories as never,
    config as never,
  );
  return { service, mcp, categories };
}

describe('AiChatService', () => {
  it('answers 503 AI_UNAVAILABLE when no key is configured', async () => {
    const { service } = setup(jest.fn(), false);
    await expect(service.chat(USER, dto())).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
  });

  it('runs a tool, feeds the result back and returns the final answer', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() =>
        toolCall('get_monthly_summary', {
          year: 2026,
          month: 10,
          currency: 'TND',
        }),
      )
      .mockImplementationOnce(() => answer('You spent 120 TND.'));
    const { service, mcp } = setup(chat);

    const reply = await service.chat(USER, dto());

    expect(reply).toEqual({
      message: 'You spent 120 TND.',
      usedTools: ['get_monthly_summary'],
    });
    expect(mcp.dispatch).toHaveBeenCalledWith(
      'u1',
      'get_monthly_summary',
      expect.objectContaining({ year: 2026, month: 10 }),
    );
    const secondCall = (
      chat.mock.calls[1] as [{ messages: Array<{ role: string }> }]
    )[0];
    expect(secondCall.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ]);
  });

  it('never runs create_draft_transaction, even if the model asks for it', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() =>
        toolCall('create_draft_transaction', { rawInput: 'x' }),
      )
      .mockImplementationOnce(() => answer('I cannot do that.'));
    const { service, mcp } = setup(chat);

    await service.chat(USER, dto());

    expect(mcp.dispatch).not.toHaveBeenCalled();
    const toolMessage = (
      chat.mock.calls[1] as [
        { messages: Array<{ role: string; content: string }> },
      ]
    )[0].messages.find((m) => m.role === 'tool');
    expect(toolMessage?.content).toContain('Unknown tool');
  });

  it('does not offer create_draft_transaction to the model', () => {
    const names = buildChatTools().map((tool) => tool.name);
    expect(names).not.toContain('create_draft_transaction');
    expect(names).toContain('search_transactions');
    expect(names).toContain('list_categories');
  });

  it('returns invalid arguments to the model instead of dispatching', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() =>
        toolCall('get_monthly_summary', { year: 'abc' }),
      )
      .mockImplementationOnce(() => answer('Sorry.'));
    const { service, mcp } = setup(chat);

    await service.chat(USER, dto());

    expect(mcp.dispatch).not.toHaveBeenCalled();
  });

  it('stops after MAX_TOOL_ROUNDS and asks for a final answer without tools', async () => {
    const chat = jest.fn((req: { tools?: unknown[] }) =>
      req.tools ? toolCall('list_accounts') : answer('Here is what I found.'),
    );
    const { service, mcp } = setup(chat);

    const reply = await service.chat(USER, dto());

    expect(reply.message).toBe('Here is what I found.');
    expect(chat).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
    expect(mcp.dispatch).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
  });

  it('serves list_categories from the categories service', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() => toolCall('list_categories'))
      .mockImplementationOnce(() => answer('ok'));
    const { service, categories } = setup(chat);

    await service.chat(USER, dto());

    expect(categories.list).toHaveBeenCalledWith('u1', expect.any(Object));
  });

  it('caps a demo visitor at DEMO_AI_CHAT_CAP messages', async () => {
    const { service } = setup(jest.fn(() => answer('hi')));

    await service.chat(DEMO, dto());
    await service.chat(DEMO, dto());
    const third = service.chat(DEMO, dto());

    await expect(third).rejects.toBeInstanceOf(HttpException);
    await expect(third).rejects.toMatchObject({ status: 429 });
  });

  it('does not cap real users', async () => {
    const { service } = setup(jest.fn(() => answer('hi')));
    for (let i = 0; i < 5; i++) await service.chat(USER, dto());
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
