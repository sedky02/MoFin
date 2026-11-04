import * as React from 'react';
import { Animated, PanResponder, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** How far (px) or how fast a downward drag on the handle has to go to close the sheet. */
const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 0.9;

/**
 * Drag-to-close for a bottom sheet: a translateY to put on the sheet and pan handlers for its grab
 * handle. Built on PanResponder (no gesture-handler root needed) so it works on Android, iOS and web.
 * Only the handle starts a drag, so the sheet's own scrolling and inputs are untouched.
 */
export function useSheetDrag(onClose?: () => void) {
  // State, not a ref: the value is created once and read while rendering (the transform).
  const [translateY] = React.useState(() => new Animated.Value(0));
  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!onClose,
        onMoveShouldSetPanResponder: (_e, g) => !!onClose && Math.abs(g.dy) > 2,
        onPanResponderMove: (_e, g) => translateY.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (onClose && (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY)) {
            onClose();
            // Reset for the next time this sheet opens.
            setTimeout(() => translateY.setValue(0), 300);
          } else {
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          }
        },
        onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
      }),
    [onClose, translateY],
  );
  return { translateY, handlers: responder.panHandlers };
}

/** The grab handle at the top of a sheet; with drag handlers, pulling it down closes the sheet. */
export function SheetHandle({ handlers }: { handlers?: ReturnType<typeof useSheetDrag>['handlers'] }) {
  return (
    <View
      {...handlers}
      // Decorative for screen readers: the sheet also closes with its ✕ / buttons and the back gesture.
      aria-hidden
      className="h-6 w-full select-none items-center justify-center web:cursor-grab">
      <View className="h-1.5 w-10 rounded-full bg-muted-foreground/35" />
    </View>
  );
}

/** Space under a sheet's last row for the home indicator / gesture bar. */
export function SheetBottomInset() {
  const insets = useSafeAreaInsets();
  return insets.bottom > 0 ? <View aria-hidden style={{ height: insets.bottom }} /> : null;
}

/** A sheet's height cap: the screen below the status bar, with a small gap so the page shows behind. */
export function useSheetMaxHeight(): number {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return height - Math.max(insets.top, 12) - 12;
}
