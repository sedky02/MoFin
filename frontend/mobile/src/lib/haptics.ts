// Light haptics for primary actions. Never a requirement: they do nothing on web, when the system
// "reduce motion" setting is on, or when the device has no haptic engine (any failure is swallowed).
import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, Platform } from 'react-native';

let reduceMotion = false;
let watching = false;

function watchReduceMotion() {
  if (watching || Platform.OS === 'web') return;
  watching = true;
  try {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        reduceMotion = on;
      })
      .catch(() => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotion = on;
    });
  } catch {
    // Accessibility info unavailable: keep haptics on.
  }
}

watchReduceMotion();

function run(effect: () => Promise<void>): void {
  if (Platform.OS === 'web' || reduceMotion) return;
  try {
    effect().catch(() => {});
  } catch {
    // No haptic engine.
  }
}

export const haptics = {
  /** A press that starts something (the Add tab). */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A long press took hold (Add opening the voice overlay): firmer than a tap. */
  hold: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Something was saved. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Confirming a destructive action. */
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Something failed. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
