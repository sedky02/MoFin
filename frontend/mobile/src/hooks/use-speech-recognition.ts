// Speech to text in one place (permission, availability, on-device recognition when available,
// transcript, errors, stopping when the screen goes away); nothing else talks to the recognizer.
import * as React from 'react';
import { Linking } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

import { addResult, commitInterim, EMPTY_TRANSCRIPT, finalText, textToSend, type Transcript } from '@/lib/speech-transcript';
import { useVoiceLocale } from '@/lib/voice-locale';

/** A tap-started turn ends this long after the last word. */
export const PAUSE_MS = 3000;
/** How long a turn waits for its first word. */
export const FIRST_WORD_MS = 8000;
/** Engines end sessions by themselves now and then; each is restarted, up to this many in a row. */
const MAX_RESTARTS = 30;

export type SpeechStatus = 'idle' | 'starting' | 'listening' | 'stopping';

/** Letting go of a held mic: `send` ends the turn, `keep` carries on until a pause. */
export type SpeechRelease = 'send' | 'keep';

/** One listening session; replaced whole by `start()` so no flag outlives it. */
interface Session {
  active: boolean;
  onDevice: boolean;
  fellBack: boolean;
  /** The on-device attempt failed: its `end` starts the default engine instead of finishing. */
  switchToDefaultEngine: boolean;
  /** We ended it (stop, pause, release), so its `end` finishes the turn instead of restarting. */
  stopRequested: boolean;
  failed: boolean;
  restarts: number;
  /** The mic is held: no pause timer, only letting go ends the turn. */
  holding: boolean;
  /** Let go before the session was up (permission prompt): applied once it is. */
  pendingRelease: SpeechRelease | null;
}

const idleSession = (): Session => ({
  active: false,
  onDevice: false,
  fellBack: false,
  switchToDefaultEngine: false,
  stopRequested: false,
  failed: false,
  restarts: 0,
  holding: false,
  pendingRelease: null,
});

export type SpeechErrorKind =
  | 'permission'
  | 'unavailable'
  /** Nothing was said before the recognizer gave up. */
  | 'no-speech'
  | 'failed';

export interface SpeechError {
  kind: SpeechErrorKind;
  message: string;
}

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
 * Calls `onDone(text)` when the turn ends: a pause, `stop()` or letting go of a held mic. The engine
 * runs continuously; this hook, not the engine, decides when you have finished.
 */
export function useSpeechRecognition({ onDone }: { onDone?: (text: string) => void } = {}) {
  const locale = useVoiceLocale();
  const [status, setStatus] = React.useState<SpeechStatus>('idle');
  const [transcript, setTranscript] = React.useState<Transcript>(EMPTY_TRANSCRIPT);
  const [error, setError] = React.useState<SpeechError | null>(null);

  // Refs, not state: the native event callbacks can arrive between renders.
  const session = React.useRef<Session>(idleSession());
  const heard = React.useRef<Transcript>(EMPTY_TRANSCRIPT);
  const pauseTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const doneRef = React.useRef(onDone);
  React.useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const begin = React.useCallback(
    (useOnDevice: boolean) => {
      session.current.onDevice = useOnDevice;
      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: useOnDevice,
        // Without these Android ends a session after about a second of silence.
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: PAUSE_MS + 1000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: PAUSE_MS + 1000,
        },
      });
    },
    [locale],
  );

  const clearPauseTimer = React.useCallback(() => {
    clearTimeout(pauseTimer.current);
    pauseTimer.current = undefined;
  }, []);

  const stop = React.useCallback(() => {
    if (!session.current.active) return;
    clearPauseTimer();
    session.current.stopRequested = true;
    setStatus('stopping');
    ExpoSpeechRecognitionModule.stop();
  }, [clearPauseTimer]);

  const waitForMoreWords = React.useCallback(() => {
    clearPauseTimer();
    if (session.current.holding || !session.current.active) return;
    const saidSomething = Boolean(textToSend(heard.current));
    pauseTimer.current = setTimeout(
      () => {
        if (!saidSomething) setError(speechErrorFor('no-speech', locale));
        stop();
      },
      saidSomething ? PAUSE_MS : FIRST_WORD_MS,
    );
  }, [clearPauseTimer, locale, stop]);

  const applyRelease = React.useCallback(
    (how: SpeechRelease) => {
      session.current.holding = false;
      if (how === 'send') stop();
      else waitForMoreWords();
    },
    [stop, waitForMoreWords],
  );

  const start = React.useCallback(
    async ({ hold = false }: { hold?: boolean } = {}) => {
      if (session.current.active) return;
      session.current = { ...idleSession(), holding: hold };
      setError(null);
      heard.current = EMPTY_TRANSCRIPT;
      setTranscript(EMPTY_TRANSCRIPT);
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        session.current = idleSession();
        setError({ kind: 'unavailable', message: "Speech recognition isn't available on this device." });
        return;
      }
      setStatus('starting');
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        session.current = idleSession();
        setStatus('idle');
        setError(speechErrorFor('not-allowed', locale));
        return;
      }
      session.current.active = true;
      // On-device keeps audio on the phone; the default engine is the fallback.
      begin(ExpoSpeechRecognitionModule.supportsOnDeviceRecognition());
      const { pendingRelease } = session.current;
      if (pendingRelease) applyRelease(pendingRelease);
      else waitForMoreWords();
    },
    [applyRelease, begin, locale, waitForMoreWords],
  );

  /** Letting go of the mic started with `start({ hold: true })`. */
  const release = React.useCallback(
    (how: SpeechRelease) => {
      if (session.current.active) applyRelease(how);
      else if (session.current.holding) session.current.pendingRelease = how;
    },
    [applyRelease],
  );

  const abort = React.useCallback(() => {
    if (!session.current.active) return;
    clearPauseTimer();
    session.current = idleSession();
    setStatus('idle');
    ExpoSpeechRecognitionModule.abort();
  }, [clearPauseTimer]);

  const reset = React.useCallback(() => {
    heard.current = EMPTY_TRANSCRIPT;
    setTranscript(EMPTY_TRANSCRIPT);
    setError(null);
  }, []);

  useSpeechRecognitionEvent('start', () => {
    if (session.current.active) setStatus('listening');
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!session.current.active) return;
    const best = event.results[0]?.transcript ?? '';
    heard.current = addResult(heard.current, best, event.isFinal);
    setTranscript(heard.current);
    session.current.restarts = 0;
    waitForMoreWords();
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!session.current.active) return;
    // The phone has on-device recognition but not for this language: try the default engine once.
    if (
      session.current.onDevice &&
      !session.current.fellBack &&
      (event.error === 'language-not-supported' || event.error === 'service-not-allowed')
    ) {
      session.current.fellBack = true;
      session.current.switchToDefaultEngine = true;
      return;
    }
    const next = speechErrorFor(event.error, locale, event.message);
    // Silence is judged by the pause timer, not the engine.
    if (!next || next.kind === 'no-speech') return;
    session.current.failed = true;
    setError(next);
  });

  useSpeechRecognitionEvent('end', () => {
    const current = session.current;
    if (!current.active) return;
    if (current.switchToDefaultEngine) {
      current.switchToDefaultEngine = false;
      begin(false);
      return;
    }
    // The engine ended by itself: listen on, keeping words it never finalised.
    if (!current.stopRequested && !current.failed && current.restarts < MAX_RESTARTS) {
      current.restarts += 1;
      heard.current = commitInterim(heard.current);
      begin(current.onDevice);
      return;
    }
    clearPauseTimer();
    session.current = idleSession();
    setStatus('idle');
    const text = textToSend(heard.current);
    if (text) doneRef.current?.(text);
  });

  // Leaving the screen (or closing the overlay) while listening stops the microphone.
  React.useEffect(
    () => () => {
      clearPauseTimer();
      if (session.current.active) {
        session.current = idleSession();
        ExpoSpeechRecognitionModule.abort();
      }
    },
    [clearPauseTimer],
  );

  return {
    status,
    listening: status === 'starting' || status === 'listening',
    finalText: finalText(transcript),
    interimText: transcript.interim,
    error,
    locale,
    start,
    stop,
    release,
    abort,
    reset,
  };
}
