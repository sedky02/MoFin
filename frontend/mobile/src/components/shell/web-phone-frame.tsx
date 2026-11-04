import * as React from 'react';
import { Platform, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { useColorScheme } from 'nativewind';

import { COLORS } from '@/theme/colors';

/** Width of the phone column on a wide browser window (a large phone). */
export const PHONE_FRAME_WIDTH = 430;

/** True when the web app is drawn as a phone column (a browser window wider than a phone). */
function useFramed(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width > PHONE_FRAME_WIDTH + 48;
}

/**
 * Style for a full-screen overlay (dialog, alert, sheet). On the web those are portalled to
 * `<body>` with `position: fixed`, so without this they would cover the whole window; this pins
 * them to the phone column. `undefined` when there is no column. Uses a negative margin, not a
 * transform, because the enter animations own `transform`.
 */
export function usePhoneFrameOverlayStyle(): ViewStyle | undefined {
  const framed = useFramed();
  if (!framed) return undefined;
  return { left: '50%', right: 'auto', width: PHONE_FRAME_WIDTH, marginLeft: -PHONE_FRAME_WIDTH / 2 };
}

/**
 * On the web, a wide window shows the app as a phone-width column in the middle of the page, so the
 * header, content, tab bar, dialogs and toasts keep their phone layout instead of stretching. Native
 * builds and narrow windows render the app as is. Portalled overlays use `usePhoneFrameOverlayStyle`.
 */
export function WebPhoneFrame({ children }: { children: React.ReactNode }) {
  const framed = useFramed();
  const { colorScheme } = useColorScheme();
  if (!framed) return <>{children}</>;
  const c = COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: c.muted }}>
      <View
        style={{
          flex: 1,
          width: PHONE_FRAME_WIDTH,
          overflow: 'hidden',
          backgroundColor: c.background,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: c.border,
        }}>
        {children}
      </View>
    </View>
  );
}
