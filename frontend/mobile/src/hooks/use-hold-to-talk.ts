import * as React from 'react';
import type { AccessibilityActionEvent } from 'react-native';

import type { SpeechRelease } from '@/hooks/use-speech-recognition';
import { haptics } from '@/lib/haptics';

/** A press at least this long is a hold; shorter is a tap. */
export const HOLD_MS = 350;

type Speech = {
  listening: boolean;
  start: (options?: { hold?: boolean }) => Promise<void>;
  stop: () => void;
  release: (how: SpeechRelease) => void;
};

/**
 * Hold the mic to talk until you let go; a tap listens until you pause; a tap while listening
 * sends. Screen readers can't hold, so their double tap toggles instead.
 */
export function useHoldToTalk(speech: Speech, { onStart }: { onStart?: () => void } = {}) {
  const [held, setHeld] = React.useState(false);
  const sendsOnRelease = React.useRef(false);
  const longPressed = React.useRef(false);

  function onPressIn() {
    haptics.tap();
    longPressed.current = false;
    sendsOnRelease.current = speech.listening;
    if (speech.listening) return;
    onStart?.();
    void speech.start({ hold: true });
  }

  function onLongPress() {
    if (sendsOnRelease.current) return;
    longPressed.current = true;
    setHeld(true);
    haptics.hold();
  }

  function onPressOut() {
    setHeld(false);
    if (sendsOnRelease.current) speech.stop();
    else speech.release(longPressed.current ? 'send' : 'keep');
  }

  function onAccessibilityAction(event: AccessibilityActionEvent) {
    if (event.nativeEvent.actionName !== 'activate') return;
    if (speech.listening) speech.stop();
    else {
      onStart?.();
      void speech.start();
    }
  }

  return {
    held,
    pressProps: {
      delayLongPress: HOLD_MS,
      onPressIn,
      onLongPress,
      onPressOut,
      accessibilityActions: [{ name: 'activate' as const }],
      onAccessibilityAction,
    },
  };
}
