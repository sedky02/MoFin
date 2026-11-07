import { PortalHost } from '@rn-primitives/portal';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { VoiceOverlay } from '@/components/voice/voice-overlay';
import type { AiChatDetail, AiChatTurn, DraftTransaction } from '@/core/types';
import { PAUSE_MS } from '@/hooks/use-speech-recognition';
import { voiceOverlay } from '@/lib/voice-overlay';

type SpeechFake = { module: Record<string, jest.Mock>; emit: (event: string, payload?: unknown) => void };
const speech = (globalThis as unknown as { __speech: SpeechFake }).__speech;
const result = (transcript: string, isFinal: boolean) => ({ isFinal, results: [{ transcript, confidence: 0.9, segments: [] }] });

/** The pause ends the turn, then the engine reports it ended. */
async function pauseThenEnd() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(PAUSE_MS);
  });
  await act(async () => speech.emit('end'));
}

const mockSend = jest.fn();
const mockPush = jest.fn();
let mockDetail: AiChatDetail | undefined;

jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/lib/voice-locale', () => ({ useVoiceLocale: () => 'en-US' }));
jest.mock('@/hooks/useAiChat', () => {
  const actual = jest.requireActual('@/hooks/useAiChat');
  return {
    ...actual,
    useSendChatMessage: () => ({ mutateAsync: mockSend, isPending: false }),
    useAiChatDetail: (id: string | null) => ({ data: id ? mockDetail : undefined }),
  };
});
jest.mock('@/hooks/useDrafts', () => ({
  useApproveDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRejectDraft: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));

const draft: DraftTransaction = {
  id: 'd1',
  rawInput: 'coffee 4.5',
  parsedData: { type: 'EXPENSE', description: 'Coffee', amount: '4.5', currency: 'TND', occurredAt: '2026-11-06T10:00:00.000Z' },
  confidenceScore: '0.8',
  status: 'PENDING',
  source: 'VOICE',
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

function turn(question: string, answer: string): AiChatTurn {
  const messages: AiChatTurn['messages'] = [
    { id: 'q', role: 'user', content: question, usedTools: [], charts: [], drafts: [], createdAt: '2026-11-06T10:00:00Z' },
    { id: 'a', role: 'assistant', content: answer, usedTools: ['create_draft_transaction'], charts: [], drafts: [draft], createdAt: '2026-11-06T10:00:01Z' },
  ];
  mockDetail = { id: 'chat-1', title: question, createdAt: '', updatedAt: '', messages };
  return { chat: { id: 'chat-1', title: question, createdAt: '', updatedAt: '' }, messages };
}

async function openOverlay() {
  await render(<><VoiceOverlay /><PortalHost /></>);
  await act(async () => voiceOverlay.open());
  await act(async () => speech.emit('start'));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockDetail = undefined;
  speech.module.requestPermissionsAsync.mockResolvedValue({ granted: true });
});
afterEach(async () => {
  await act(() => voiceOverlay.close());
  jest.useRealTimers();
});

describe('VoiceOverlay', () => {
  it('stays closed until opened, then starts listening straight away', async () => {
    await render(<><VoiceOverlay /><PortalHost /></>);
    expect(screen.queryByText('Ask MoFin')).toBeNull();
    await act(async () => voiceOverlay.open());
    expect(screen.getByText('Ask MoFin')).toBeTruthy();
    expect(speech.module.start).toHaveBeenCalledTimes(1);
  });

  it('shows settled words normally and words still being heard lighter', async () => {
    await openOverlay();
    await act(async () => speech.emit('result', result('coffee four', true)));
    await act(async () => speech.emit('result', result('fifty', false)));
    expect(screen.getByText('coffee four')).toBeTruthy();
    const interim = screen.getByText('fifty');
    expect(interim.props.className).toContain('text-muted-foreground');
  });

  it('sends only the final transcript, as a voice message, and shows the answer with its draft card', async () => {
    mockSend.mockResolvedValue(turn('Coffee 4.5', 'Drafted. Approve it below.'));
    await openOverlay();
    await act(async () => speech.emit('result', result('Coffee', false)));
    await act(async () => speech.emit('result', result('Coffee 4.5', true)));
    await pauseThenEnd();

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({ chatId: null, content: 'Coffee 4.5', inputMode: 'voice' });
    expect(await screen.findByLabelText('MoFin: Drafted. Approve it below.')).toBeTruthy();
    expect(screen.getByLabelText('Approve')).toBeTruthy();
  });

  it('keeps follow-ups in the same chat, and opens it with "Open in chat"', async () => {
    mockSend.mockResolvedValue(turn('Coffee 4.5', 'Drafted.'));
    await openOverlay();
    await act(async () => speech.emit('result', result('Coffee 4.5', true)));
    await pauseThenEnd();

    // A quick tap on the mic for a follow-up: it listens until a pause.
    const mic = screen.getByLabelText('Speak');
    await fireEvent(mic, 'pressIn');
    await fireEvent(mic, 'pressOut');
    await act(async () => speech.emit('start'));
    await act(async () => speech.emit('result', result('and lunch 18', true)));
    await pauseThenEnd();
    expect(mockSend).toHaveBeenLastCalledWith({ chatId: 'chat-1', content: 'and lunch 18', inputMode: 'voice' });

    await fireEvent.press(screen.getByLabelText('Open in chat'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/ask/[id]', params: { id: 'chat-1' } });
    expect(screen.queryByText('Ask MoFin')).toBeNull();
  });

  it('switches to typing, and sends typed questions as text', async () => {
    mockSend.mockResolvedValue(turn('How much on food?', 'About 120 TND.'));
    await openOverlay();
    await fireEvent.press(screen.getByLabelText('Type instead'));
    expect(speech.module.abort).toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Type your question'), 'How much on food?');
    await fireEvent.press(screen.getByLabelText('Send question'));
    expect(mockSend).toHaveBeenCalledWith({ chatId: null, content: 'How much on food?', inputMode: 'text' });
  });

  it('stops the microphone when closed while listening, and sends nothing', async () => {
    await openOverlay();
    await act(async () => speech.emit('result', result('half a sent', false)));
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(speech.module.abort).toHaveBeenCalled();
    await act(async () => speech.emit('end'));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('explains a refused permission and offers Settings', async () => {
    speech.module.requestPermissionsAsync.mockResolvedValue({ granted: false });
    await render(<><VoiceOverlay /><PortalHost /></>);
    await act(async () => voiceOverlay.open());
    expect(await screen.findByText(/needs microphone and speech access/)).toBeTruthy();
    expect(screen.getByLabelText('Open Settings')).toBeTruthy();
  });
});
