// Speech to text, in one place: permission, availability, on-device recognition when the phone has
// it, the transcript as it comes in, errors, and stopping when the screen using it goes away. The
// voice overlay and the Ask chat's mic both use this hook; nothing else talks to the recognizer.
import * as React from 'react';
import { Linking } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

import { addResult, EMPTY_TRANSCRIPT, finalText, textToSend, type Transcript } from '@/lib/speech-transcript';
import { useVoiceLocale } from '@/lib/voice-locale';

export type SpeechStatus = 'idle' | 'starting' | 'listening' | 'stopping';

export type SpeechErrorKind =
  /** Microphone or speech permission refused: Settings is the way back. */
  | 'permission'
  /** No recognizer on this device, or none for this language. */
  | 'unavailable'
  /** Nothing was said before the recognizer gave up. */
  | 'no-speech'
  /** It broke mid-session (network, audio, interrupted). */
  | 'failed';

export interface SpeechError {
  kind: SpeechErrorKind;
  message: string;
}

/** The message for each way a session can fail, in the app's voice. */
export function speechErrorFor(code: ExpoSpeechRecognitionErrorCode, locale: string, detail = ''): SpeechError | null {
  switch (code) {
    case 'aborted':
      return null; // We stopped it ourselves.
    case 'not-allowed':
      return { kind: 'permission', message: 'MoFin needs microphone and speech access. Turn it on in Settings.' };
    case 'service-not-allowed':
    case 'language-not-supported':
      return { kind: 'unavailable', message: `Speech recognition isn't available on this device for ${locale}.` };
    case 'no-speech':
    case 'speech-timeout':
      return { kind: 'no-speech', message: "Didn't catch that. Tap the mic and try again." };
    case 'network':
      return { kind: 'failed', message: 'Speech recognition needs a connection. Check your internet and try again.' };
    case 'interrupted':
      return { kind: 'failed', message: 'Listening was interrupted. Tap the mic to try again.' };
    default:
      return { kind: 'failed', message: `Listening stopped${detail ? `: ${detail}` : ''}. Tap the mic to try again.` };
  }
}

export function openSpeechSettings(): void {
  void Linking.openSettings();
}

/**
 * Listens on `start()` and calls `onDone(text)` with what was said once listening ends (on its
 * own after a pause, or on `stop()`). `abort()` and leaving the screen drop the session without
 * calling `onDone`. Only the session this hook started is handled, so two screens using it don't
 * read each other's speech.
 */
export function useSpeechRecognition({ onDone }: { onDone?: (text: string) => void } = {}) {
  const locale = useVoiceLocale();
  const [status, setStatus] = React.useState<SpeechStatus>('idle');
  const [transcript, setTranscript] = React.useState<Transcript>(EMPTY_TRANSCRIPT);
  const [error, setError] = React.useState<SpeechError | null>(null);

  // Mirrors for the native event callbacks, which can arrive between renders.
  const active = React.useRef(false);
  const aborted = React.useRef(false);
  const onDevice = React.useRef(false);
  const fellBack = React.useRef(false);
  /** Set when the on-device attempt failed: its `end` starts the default engine instead of finishing. */
  const restart = React.useRef(false);
  const heard = React.useRef<Transcript>(EMPTY_TRANSCRIPT);
  const doneRef = React.useRef(onDone);
  React.useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const begin = React.useCallback(
    (useOnDevice: boolean) => {
      onDevice.current = useOnDevice;
      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        // One turn at a time: it ends after a pause, and the question goes out.
        continuous: false,
        addsPunctuation: true,
        requiresOnDeviceRecognition: useOnDevice,
      });
    },
    [locale],
  );

  const start = React.useCallback(async () => {
    if (active.current) return;
    setError(null);
    heard.current = EMPTY_TRANSCRIPT;
    setTranscript(EMPTY_TRANSCRIPT);
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError({ kind: 'unavailable', message: "Speech recognition isn't available on this device." });
      return;
    }
    setStatus('starting');
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setStatus('idle');
      setError(speechErrorFor('not-allowed', locale));
      return;
    }
    active.current = true;
    aborted.current = false;
    fellBack.current = false;
    restart.current = false;
    // On-device keeps audio on the phone; the default engine is the fallback.
    begin(ExpoSpeechRecognitionModule.supportsOnDeviceRecognition());
  }, [begin, locale]);

  /** Stop listening and send what was heard. */
  const stop = React.useCallback(() => {
    if (!active.current) return;
    setStatus('stopping');
    ExpoSpeechRecognitionModule.stop();
  }, []);

  /** Stop listening and drop what was heard. */
  const abort = React.useCallback(() => {
    if (!active.current) return;
    aborted.current = true;
    active.current = false;
    setStatus('idle');
    ExpoSpeechRecognitionModule.abort();
  }, []);

  const reset = React.useCallback(() => {
    heard.current = EMPTY_TRANSCRIPT;
    setTranscript(EMPTY_TRANSCRIPT);
    setError(null);
  }, []);

  useSpeechRecognitionEvent('start', () => {
    if (active.current) setStatus('listening');
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!active.current) return;
    const best = event.results[0]?.transcript ?? '';
    heard.current = addResult(heard.current, best, event.isFinal);
    setTranscript(heard.current);
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!active.current) return;
    // The phone has on-device recognition but not for this language: try the default engine once.
    if (
      onDevice.current &&
      !fellBack.current &&
      (event.error === 'language-not-supported' || event.error === 'service-not-allowed')
    ) {
      fellBack.current = true;
      restart.current = true;
      return;
    }
    const next = speechErrorFor(event.error, locale, event.message);
    // "No speech" with words already heard is just the end of the turn.
    if (next?.kind === 'no-speech' && textToSend(heard.current)) return;
    if (next) setError(next);
  });

  useSpeechRecognitionEvent('end', () => {
    if (!active.current) return;
    // The on-device attempt ended in a fallback: listen again with the default engine.
    if (restart.current) {
      restart.current = false;
      begin(false);
      return;
    }
    active.current = false;
    setStatus('idle');
    const text = textToSend(heard.current);
    if (!aborted.current && text) doneRef.current?.(text);
  });

  // Leaving the screen (or closing the overlay) while listening stops the microphone.
  React.useEffect(
    () => () => {
      if (active.current) {
        aborted.current = true;
        active.current = false;
        ExpoSpeechRecognitionModule.abort();
      }
    },
    [],
  );

  return {
    status,
    listening: status === 'starting' || status === 'listening',
    /** Settled words, shown normally. */
    finalText: finalText(transcript),
    /** Words still being recognized, shown lighter. */
    interimText: transcript.interim,
    error,
    locale,
    start,
    stop,
    abort,
    reset,
  };
}
