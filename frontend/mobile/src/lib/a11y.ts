import { AccessibilityInfo, Platform } from 'react-native';

/** Says `message` through the screen reader (VoiceOver / TalkBack). Web uses live regions instead. */
export function announce(message: string): void {
  if (Platform.OS === 'web' || !message) return;
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // No screen reader hook available.
  }
}
