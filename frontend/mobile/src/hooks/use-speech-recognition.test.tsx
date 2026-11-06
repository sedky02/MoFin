import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { openSpeechSettings, speechErrorFor, useSpeechRecognition } from '@/hooks/use-speech-recognition';

type SpeechFake = {
  module: Record<string, jest.Mock>;
  emit: (event: string, payload?: unknown) => void;
};
const speech = (globalThis as unknown as { __speech: SpeechFake }).__speech;
const result = (transcript: string, isFinal: boolean) => ({ isFinal, results: [{ transcript, confidence: 0.9, segments: [] }] });

jest.mock('@/lib/voice-locale', () => ({ useVoiceLocale: () => 'fr-TN' }));

beforeEach(() => {
  jest.clearAllMocks();
  speech.module.isRecognitionAvailable.mockReturnValue(true);
  speech.module.supportsOnDeviceRecognition.mockReturnValue(true);
  speech.module.requestPermissionsAsync.mockResolvedValue({ granted: true });
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
    await act(async () => speech.emit('end'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('rent'));
    expect(other).not.toHaveBeenCalled();
  });
});

describe('speechErrorFor', () => {
  it('names each failure in plain words', () => {
    expect(speechErrorFor('aborted', 'en-US')).toBeNull();
    expect(speechErrorFor('language-not-supported', 'ar-TN')?.message).toContain('ar-TN');
    expect(speechErrorFor('no-speech', 'en-US')?.kind).toBe('no-speech');
  });
});
