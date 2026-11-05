import { fireEvent, render, screen } from '@testing-library/react-native';

import { AskChart, axisLabel, chartSummary } from '@/components/ask/ask-chart';
import { groupChats } from '@/components/ask/ask-chat-list';
import { AssistantMessage, RichText } from '@/components/ask/ask-message';
import { AskThreadScreen } from '@/components/ask/ask-thread-screen';
import { ApiClientError } from '@/api/client';
import type { AiChart, AiChatTurn } from '@/core/types';
import { chatErrorMessage } from '@/hooks/useAiChat';

const mockMutateAsync = jest.fn();
let mockParams: { id: string; q?: string } = { id: 'new' };
const mockSetParams = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { setParams: (p: unknown) => mockSetParams(p), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/hooks/useAiChat', () => {
  const actual = jest.requireActual('@/hooks/useAiChat');
  return {
    ...actual,
    useAiChatDetail: () => ({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() }),
    useSendChatMessage: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  };
});

const donut: AiChart = {
  kind: 'donut',
  title: 'Spending by category, November 2026',
  currency: 'TND',
  axis: 'category',
  labels: ['Rent', 'Food'],
  series: [{ name: 'Expenses', tone: 'expense', values: ['800', '200'] }],
};

const turn = (q: string, a: string): AiChatTurn => ({
  chat: { id: 'chat-1', title: q, createdAt: '', updatedAt: '' },
  messages: [
    { id: 'q', role: 'user', content: q, usedTools: [], charts: [], createdAt: '2026-11-05T10:00:00Z' },
    { id: 'a', role: 'assistant', content: a, usedTools: [], charts: [], createdAt: '2026-11-05T10:00:01Z' },
  ],
});

describe('RichText', () => {
  it('renders bullets as a list and bold as text', async () => {
    await render(<RichText text={'You spent **120 TND**.\n\n- Rent: 800\n- Food: 120'} />);
    expect(screen.getByText('120 TND')).toBeTruthy();
    expect(screen.getByText('Rent: 800')).toBeTruthy();
    expect(screen.getAllByText('•')).toHaveLength(2);
  });
});

describe('AskChart', () => {
  it('reads the whole chart to a screen reader', () => {
    expect(chartSummary(donut)).toContain('Rent:');
    expect(chartSummary(donut)).toContain('Food:');
  });

  it('shows each slice with its share', async () => {
    await render(<AskChart chart={donut} />);
    expect(screen.getByText('Rent · 80%', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Spending by category, November 2026')).toBeTruthy();
  });

  it('formats month and day labels', () => {
    expect(axisLabel('Food', 'category')).toBe('Food');
    expect(axisLabel('2026-10', 'month')).not.toBe('2026-10');
  });
});

describe('AssistantMessage', () => {
  it('shows the answer, its charts and what it looked at', async () => {
    await render(
      <AssistantMessage
        message={{
          id: 'a',
          role: 'assistant',
          content: 'Rent is the biggest.',
          usedTools: ['get_monthly_summary', 'chart_spending_by_category'],
          charts: [donut],
          createdAt: '2026-11-05T10:00:00Z',
        }}
      />,
    );
    expect(screen.getByLabelText('MoFin: Rent is the biggest.')).toBeTruthy();
    expect(screen.getByText(/Looked at monthly summary/)).toBeTruthy();
    expect(screen.getByText('Rent · 80%', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('groupChats', () => {
  it('groups by when a chat was last active', () => {
    const now = new Date(2026, 10, 5, 12);
    const at = (d: number) => ({ id: String(d), title: 't', createdAt: '', updatedAt: new Date(2026, 10, d, 9).toISOString() });
    expect(groupChats([at(5), at(4), at(1), at(-10)], now).map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Earlier']);
  });
});

describe('AskThreadScreen', () => {
  beforeEach(() => {
    mockParams = { id: 'new' };
    mockMutateAsync.mockReset();
    mockSetParams.mockReset();
  });

  it('starts a chat with the first question and moves the route to its id', async () => {
    mockMutateAsync.mockResolvedValue(turn('How much?', '120 TND.'));
    await render(<AskThreadScreen />);
    await fireEvent.changeText(screen.getByLabelText('Ask a question about your finances'), 'How much?');
    await fireEvent.press(screen.getByLabelText('Send question'));
    expect(mockMutateAsync).toHaveBeenCalledWith({ chatId: null, content: 'How much?' });
    expect(mockSetParams).toHaveBeenCalledWith({ id: 'chat-1', q: undefined });
  });

  it('asks a suggestion passed in the route once', async () => {
    mockParams = { id: 'new', q: 'Where did my money go this month?' };
    mockMutateAsync.mockResolvedValue(turn('q', 'a'));
    await render(<AskThreadScreen />);
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({ chatId: null, content: 'Where did my money go this month?' });
  });

  it('keeps a failed question on screen with the reason and a retry', async () => {
    mockMutateAsync.mockRejectedValueOnce(new ApiClientError(503, 'The assistant is busy. Try again in a minute.', { code: 'AI_UNAVAILABLE', retryAfterSeconds: 20 } as never));
    await render(<AskThreadScreen />);
    await fireEvent.changeText(screen.getByLabelText('Ask a question about your finances'), 'How much?');
    await fireEvent.press(screen.getByLabelText('Send question'));
    expect(screen.getByText(/about 20 seconds/)).toBeTruthy();
    expect(screen.getByLabelText('You: How much?')).toBeTruthy();
    mockMutateAsync.mockResolvedValueOnce(turn('How much?', 'ok'));
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockMutateAsync).toHaveBeenLastCalledWith({ chatId: null, content: 'How much?' });
  });
});

describe('chatErrorMessage', () => {
  it('matches the web wording', () => {
    const err = (status: number, body: object, message = 'msg') => new ApiClientError(status, message, body as never);
    expect(chatErrorMessage(err(503, { retryAfterSeconds: 30 }, 'Busy.'))).toBe('Busy. You can try again in about 30 seconds.');
    expect(chatErrorMessage(err(429, { code: 'DEMO_LIMIT' }, 'Demo cap.'))).toBe('Demo cap.');
    expect(chatErrorMessage(err(400, { code: 'CHAT_FULL' }, 'Full.'))).toBe('Full.');
  });
});
