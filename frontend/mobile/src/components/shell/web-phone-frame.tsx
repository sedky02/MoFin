import * as React from 'react';
import { Platform, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { useColorScheme } from 'nativewind';

import { COLORS } from '@/theme/colors';

export const PHONE_FRAME_WIDTH = 430;

function useFramed(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width > PHONE_FRAME_WIDTH + 48;
}

/**
 * Pins a full-screen overlay to the phone column (on web they portal to <body> with `position:
 * fixed` and would cover the window). A negative margin, since animations own `transform`.
 */
export function usePhoneFrameOverlayStyle(): ViewStyle | undefined {
  const framed = useFramed();
  if (!framed) return undefined;
  return { left: '50%', right: 'auto', width: PHONE_FRAME_WIDTH, marginLeft: -PHONE_FRAME_WIDTH / 2 };
}

/**
 * On the web a wide window shows a phone-width column so everything keeps its phone layout; native
 * builds and narrow windows render as is. Portalled overlays use `usePhoneFrameOverlayStyle`.
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
