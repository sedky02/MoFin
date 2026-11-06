import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AskChart, axisLabel, chartSummary } from '@/components/ask/ask-chart';
import { groupChats } from '@/components/ask/ask-chat-list';
import { AssistantMessage, RichText } from '@/components/ask/ask-message';
import { AskThreadScreen } from '@/components/ask/ask-thread-screen';
import { ApiClientError } from '@/api/client';
import type { AiChart, AiChatTurn, DraftTransaction } from '@/core/types';
import { chatErrorMessage } from '@/hooks/useAiChat';

const mockMutateAsync = jest.fn();
let mockParams: { id: string; q?: string } = { id: 'new' };
const mockSetParams = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { setParams: (p: unknown) => mockSetParams(p), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
// The draft cards' requests and the account names they show.
jest.mock('@/hooks/useDrafts', () => ({
  useApproveDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRejectDraft: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a1', name: 'Checking', type: 'BANK', currency: 'TND' }] }),
}));
jest.mock('@/hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));
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
    { id: 'q', role: 'user', content: q, usedTools: [], charts: [], drafts: [], createdAt: '2026-11-05T10:00:00Z' },
    { id: 'a', role: 'assistant', content: a, usedTools: [], charts: [], drafts: [], createdAt: '2026-11-05T10:00:01Z' },
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
          drafts: [],
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
    expect(mockMutateAsync).toHaveBeenCalledWith({ chatId: null, content: 'How much?', inputMode: 'text' });
    expect(mockSetParams).toHaveBeenCalledWith({ id: 'chat-1', q: undefined });
  });

  it('asks a suggestion passed in the route once', async () => {
    mockParams = { id: 'new', q: 'Where did my money go this month?' };
    mockMutateAsync.mockResolvedValue(turn('q', 'a'));
    await render(<AskThreadScreen />);
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({ chatId: null, content: 'Where did my money go this month?', inputMode: 'text' });
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
    expect(mockMutateAsync).toHaveBeenLastCalledWith({ chatId: null, content: 'How much?', inputMode: 'text' });
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

describe('draft cards in an answer', () => {
  const chatDraft = (over: Partial<DraftTransaction> = {}): DraftTransaction => ({
    id: 'd1',
    rawInput: 'coffee 4.5',
    parsedData: { type: 'EXPENSE', description: 'Coffee', amount: '4.5', currency: 'TND', occurredAt: '2026-11-05T10:00:00.000Z', fromAccountId: 'a1' },
    confidenceScore: '0.9',
    status: 'PENDING',
    source: 'CHAT',
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
    ...over,
  });
  const answerWith = (drafts: DraftTransaction[]) => (
    <AssistantMessage
      message={{ id: 'a', role: 'assistant', content: 'Drafted.', usedTools: ['create_draft_transaction'], charts: [], drafts, createdAt: '2026-11-05T10:00:00Z' }}
    />
  );

  it('shows a pending draft with Approve, Review & edit and Reject', async () => {
    await render(answerWith([chatDraft()]));
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByLabelText('Approve')).toBeTruthy();
    expect(screen.getByLabelText('Review & edit')).toBeTruthy();
    expect(screen.getByLabelText('Reject')).toBeTruthy();
    // The question is right above, so the card doesn't quote it again.
    expect(screen.queryByText('“coffee 4.5”')).toBeNull();
    // A draft is not something it "looked at".
    expect(screen.queryByText(/Looked at/)).toBeNull();
  });

  it('shows the final status, without buttons, once the draft was handled elsewhere', async () => {
    await render(answerWith([chatDraft({ status: 'APPROVED' })]));
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.queryByLabelText('Approve')).toBeNull();
    expect(screen.queryByLabelText('Reject')).toBeNull();
  });
});

describe('AskThreadScreen: the mic', () => {
  type SpeechFake = { module: Record<string, jest.Mock>; emit: (event: string, payload?: unknown) => void };
  const speech = (globalThis as unknown as { __speech: SpeechFake }).__speech;
  const heard = (transcript: string, isFinal: boolean) => ({ isFinal, results: [{ transcript, confidence: 0.9, segments: [] }] });

  beforeEach(() => {
    mockParams = { id: 'new' };
    mockMutateAsync.mockReset();
    speech.module.requestPermissionsAsync.mockResolvedValue({ granted: true });
  });

  it('puts what was said in the box to check, then sends it as a voice question', async () => {
    mockMutateAsync.mockResolvedValue(turn('Coffee 4.5', 'Drafted.'));
    await render(<AskThreadScreen />);
    await fireEvent.press(screen.getByLabelText('Speak your question'));
    await act(async () => speech.emit('start'));
    await act(async () => speech.emit('result', heard('Coffee', false)));
    // While listening the box shows the words as they come.
    expect(screen.getByLabelText('Ask a question about your finances').props.value).toBe('Coffee');
    await act(async () => speech.emit('result', heard('Coffee 4.5', true)));
    await act(async () => speech.emit('end'));
    expect(screen.getByLabelText('Ask a question about your finances').props.value).toBe('Coffee 4.5');
    expect(mockMutateAsync).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Send question'));
    expect(mockMutateAsync).toHaveBeenCalledWith({ chatId: null, content: 'Coffee 4.5', inputMode: 'voice' });
  });
});
