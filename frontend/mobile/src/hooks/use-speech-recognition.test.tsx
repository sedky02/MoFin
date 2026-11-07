import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { FIRST_WORD_MS, openSpeechSettings, PAUSE_MS, speechErrorFor, useSpeechRecognition } from '@/hooks/use-speech-recognition';

type SpeechFake = {
  module: Record<string, jest.Mock>;
  emit: (event: string, payload?: unknown) => void;
};
const speech = (globalThis as unknown as { __speech: SpeechFake }).__speech;
const result = (transcript: string, isFinal: boolean) => ({ isFinal, results: [{ transcript, confidence: 0.9, segments: [] }] });

jest.mock('@/lib/voice-locale', () => ({ useVoiceLocale: () => 'fr-TN' }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  speech.module.isRecognitionAvailable.mockReturnValue(true);
  speech.module.supportsOnDeviceRecognition.mockReturnValue(true);
  speech.module.requestPermissionsAsync.mockResolvedValue({ granted: true });
});

afterEach(() => jest.useRealTimers());

const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function started(onDone = jest.fn()) {
  const hook = await renderHook(() => useSpeechRecognition({ onDone }));
  await act(async () => hook.result.current.start());
  await act(async () => speech.emit('start'));
  return { ...hook, onDone };
}

describe('useSpeechRecognition', () => {
  it('listens in the chosen language, on-device when the phone supports it, with interim results', async () => {
    const { result: r } = await started();
    expect(speech.module.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'fr-TN', interimResults: true, requiresOnDeviceRecognition: true }),
    );
    expect(r.current.status).toBe('listening');
  });

  it('uses the default engine when the phone has no on-device recognition', async () => {
    speech.module.supportsOnDeviceRecognition.mockReturnValue(false);
    await started();
    expect(speech.module.start).toHaveBeenCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: false }));
  });

  it('shows finals and the interim apart, and hands over the whole text when listening ends', async () => {
    const { result: r, onDone } = await started();
    await act(async () => speech.emit('result', result('coffee', false)));
    expect(r.current.interimText).toBe('coffee');
    await act(async () => speech.emit('result', result('coffee 4.5', true)));
    await act(async () => speech.emit('result', result('and lunch', false)));
    expect(r.current.finalText).toBe('coffee 4.5');
    expect(r.current.interimText).toBe('and lunch');
    await act(async () => speech.emit('result', result('and lunch 18', true)));
    await wait(PAUSE_MS);
    await act(async () => speech.emit('end'));
    expect(onDone).toHaveBeenCalledWith('coffee 4.5 and lunch 18');
    expect(r.current.status).toBe('idle');
  });

  it('stop() ends the turn and still hands over what was heard', async () => {
    const { result: r, onDone } = await started();
    await act(async () => speech.emit('result', result('rent', false)));
    await act(async () => r.current.stop());
    expect(speech.module.stop).toHaveBeenCalled();
    await act(async () => speech.emit('end'));
    expect(onDone).toHaveBeenCalledWith('rent');
  });

  it('abort() drops what was heard', async () => {
    const { result: r, onDone } = await started();
    await act(async () => speech.emit('result', result('rent', true)));
    await act(async () => r.current.abort());
    await act(async () => speech.emit('end'));
    expect(speech.module.abort).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('says what to do when permission is refused, and links to Settings', async () => {
    speech.module.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const { result: r } = await renderHook(() => useSpeechRecognition());
    await act(async () => r.current.start());
    expect(speech.module.start).not.toHaveBeenCalled();
    expect(r.current.error).toMatchObject({ kind: 'permission' });
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    openSpeechSettings();
    expect(open).toHaveBeenCalled();
  });

  it('says so when the device has no recognizer', async () => {
    speech.module.isRecognitionAvailable.mockReturnValue(false);
    const { result: r } = await renderHook(() => useSpeechRecognition());
    await act(async () => r.current.start());
    expect(r.current.error).toMatchObject({ kind: 'unavailable' });
    expect(speech.module.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('falls back to the default engine when the on-device one lacks the language', async () => {
    const { onDone } = await started();
    await act(async () => speech.emit('error', { error: 'language-not-supported', message: '' }));
    await act(async () => speech.emit('end'));
    // The failed attempt's end starts the default engine instead of finishing.
    expect(onDone).not.toHaveBeenCalled();
    expect(speech.module.start).toHaveBeenLastCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: false }));
    await act(async () => speech.emit('result', result('lunch 18', true)));
    await wait(PAUSE_MS);
    await act(async () => speech.emit('end'));
    expect(onDone).toHaveBeenCalledWith('lunch 18');
  });

  it('reports an error mid-session', async () => {
    const { result: r } = await started();
    await act(async () => speech.emit('error', { error: 'network', message: 'offline' }));
    expect(r.current.error).toMatchObject({ kind: 'failed' });
    expect(r.current.error?.message).toMatch(/connection/);
  });

  it('stops the microphone when the screen goes away while listening', async () => {
    const { unmount, onDone } = await started();
    await act(async () => unmount());
    expect(speech.module.abort).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("ignores another screen's session", async () => {
    const other = jest.fn();
    await renderHook(() => useSpeechRecognition({ onDone: other }));
    const { onDone } = await started();
    await act(async () => speech.emit('result', result('rent', true)));
    await wait(PAUSE_MS);
    await act(async () => speech.emit('end'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('rent'));
    expect(other).not.toHaveBeenCalled();
  });
});

describe('listening through pauses', () => {
  it('keeps the engine running, so a pause alone never ends the turn', async () => {
    await started();
    expect(speech.module.start).toHaveBeenCalledWith(expect.objectContaining({ continuous: true }));
  });

  it('ends the turn PAUSE_MS after the last word, each new word restarting the wait', async () => {
    const { onDone } = await started();
    await act(async () => speech.emit('result', result('coffee', false)));
    await wait(PAUSE_MS - 500);
    await act(async () => speech.emit('result', result('coffee four', false)));
    await wait(PAUSE_MS - 500);
    expect(speech.module.stop).not.toHaveBeenCalled();
    await wait(500);
    expect(speech.module.stop).toHaveBeenCalledTimes(1);
    await act(async () => speech.emit('end'));
    expect(onDone).toHaveBeenCalledWith('coffee four');
  });

  it('waits longer for the first word, then says nothing was caught', async () => {
    const { result: r, onDone } = await started();
    await wait(FIRST_WORD_MS - 1);
    expect(speech.module.stop).not.toHaveBeenCalled();
    await wait(1);
    expect(speech.module.stop).toHaveBeenCalled();
    expect(r.current.error).toMatchObject({ kind: 'no-speech' });
    await act(async () => speech.emit('end'));
    expect(onDone).not.toHaveBeenCalled();
  });

  it('restarts the engine when it ends by itself, keeping the words it never finalised', async () => {
    const { result: r, onDone } = await started();
    await act(async () => speech.emit('result', result('rent', true)));
    await act(async () => speech.emit('result', result('and food', false)));
    speech.module.start.mockClear();
    await act(async () => speech.emit('end'));
    expect(speech.module.start).toHaveBeenCalledTimes(1);
    expect(r.current.listening).toBe(true);
    await act(async () => speech.emit('result', result('twenty', true)));
    await wait(PAUSE_MS);
    await act(async () => speech.emit('end'));
    expect(onDone).toHaveBeenCalledWith('rent and food twenty');
  });

  it('does not restart after an error', async () => {
    await started();
    await act(async () => speech.emit('error', { error: 'network', message: '' }));
    speech.module.start.mockClear();
    await act(async () => speech.emit('end'));
    expect(speech.module.start).not.toHaveBeenCalled();
  });

  it("leaves silence to the pause timer, ignoring the engine's own no-speech", async () => {
    const { result: r } = await started();
    await act(async () => speech.emit('error', { error: 'no-speech', message: '' }));
    expect(r.current.error).toBeNull();
  });
});

describe('holding the mic', () => {
  async function held() {
    const onDone = jest.fn();
    const hook = await renderHook(() => useSpeechRecognition({ onDone }));
    await act(async () => hook.result.current.start({ hold: true }));
    await act(async () => speech.emit('start'));
    return { ...hook, onDone };
  }

  it('never times out while held, through silence or speech', async () => {
    const { result: r } = await held();
    await wait(FIRST_WORD_MS * 3);
    await act(async () => speech.emit('result', result('rent', true)));
    await wait(PAUSE_MS * 5);
    expect(speech.module.stop).not.toHaveBeenCalled();
    expect(r.current.listening).toBe(true);
  });

  it('sends what was said when let go after a hold', async () => {
    const { result: r, onDone } = await held();
    await act(async () => speech.emit('result', result('rent 800', true)));
    await act(async () => r.current.release('send'));
    expect(speech.module.stop).toHaveBeenCalled();
    await act(async () => speech.emit('end'));
    expect(onDone).toHaveBeenCalledWith('rent 800');
  });

  it('keeps listening after a quick tap, then ends on the pause', async () => {
    const { result: r, onDone } = await held();
    await act(async () => r.current.release('keep'));
    await act(async () => speech.emit('result', result('lunch 18', true)));
    await wait(PAUSE_MS - 1);
    expect(speech.module.stop).not.toHaveBeenCalled();
    await wait(1);
    expect(speech.module.stop).toHaveBeenCalled();
    await act(async () => speech.emit('end'));
    expect(onDone).toHaveBeenCalledWith('lunch 18');
  });

  it('applies a release that came while the permission prompt was open', async () => {
    let answer: (value: { granted: boolean }) => void = () => {};
    speech.module.requestPermissionsAsync.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result: r } = await renderHook(() => useSpeechRecognition());
    let starting: Promise<void> = Promise.resolve();
    await act(async () => {
      starting = r.current.start({ hold: true });
    });
    await act(async () => r.current.release('send'));
    await act(async () => {
      answer({ granted: true });
      await starting;
    });
    expect(speech.module.stop).toHaveBeenCalled();
  });
});

describe('speechErrorFor', () => {
  it('names each failure in plain words', () => {
    expect(speechErrorFor('aborted', 'en-US')).toBeNull();
    expect(speechErrorFor('language-not-supported', 'ar-TN')?.message).toContain('ar-TN');
    expect(speechErrorFor('no-speech', 'en-US')?.kind).toBe('no-speech');
  });
});
