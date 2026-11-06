import * as React from 'react';
import {
  Animated,
  Keyboard,
  PanResponder,
  Platform,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The sheet backdrop's fade in: short enough to read as "there at once". */
export const BACKDROP_IN_MS = 120;
/** The sheet's slide down on close; the backdrop fades out over the same time, so they leave together. */
export const SHEET_OUT_MS = 200;

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

/**
 * Space under a sheet's last row for the home indicator / gesture bar. While the keyboard is up it
 * covers the indicator, so the space goes away and the last row sits right on the keyboard.
 */
export function SheetBottomInset() {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const style = useAnimatedStyle(() => ({ height: keyboard.height.value > 0 ? 0 : insets.bottom }));
  return insets.bottom > 0 ? <Reanimated.View aria-hidden style={style} /> : null;
}

/** A sheet's height cap: the screen below the status bar, with a small gap so the page shows behind. */
export function useSheetMaxHeight(): number {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return height - Math.max(insets.top, 12) - 12;
}

/**
 * Keyboard handling for every bottom sheet (and the add-transaction screen), in one place:
 * - `lift` goes on the bottom-anchored container: it raises the sheet to sit on the keyboard, and
 *   lowers it again when the keyboard closes.
 * - `cap` goes on the sheet: its height is held to the room above the keyboard. A sheet that fits
 *   simply rides up; a taller one stays under the status bar, its body (a SheetScrollView) scrolls,
 *   and the rows after the body (the actions) stay pinned just above the keyboard.
 * Reanimated reads the real keyboard height on iOS and Android (KeyboardAvoidingView doesn't lift
 * anything under Android's edge-to-edge layout). On the web the browser resizes the page itself, so
 * the height stays 0 and nothing moves.
 */
export function useSheetKeyboard(callerCap?: number) {
  const screenCap = useSheetMaxHeight();
  const maxHeight = Math.min(screenCap, callerCap ?? Infinity);
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  const cap = useAnimatedStyle(() => ({ maxHeight: sheetCap(maxHeight, keyboard.height.value) }));
  return { keyboard, lift, cap };
}

/** How much room to leave between the focused field and the keyboard or the pinned actions. */
const FOCUS_MARGIN = 24;

/** The tallest a sheet may be with the keyboard up: the room above it (never below a usable minimum). */
export function sheetCap(maxHeight: number, keyboardHeight: number): number {
  'worklet';
  return Math.max(maxHeight - keyboardHeight, 120);
}

/**
 * Where to scroll so a field (top `y`, height `h`, in content coordinates) shows inside a viewport
 * scrolled to `offset`, with `margin` around it; null when it already shows.
 */
export function revealOffset(y: number, h: number, offset: number, viewport: number, margin = FOCUS_MARGIN): number | null {
  if (y + h + margin > offset + viewport) return y + h + margin - viewport;
  if (y - margin < offset) return Math.max(0, y - margin);
  return null;
}

/** A mounted native view that can measure itself against another one. */
type Measurable = {
  measureLayout: (relativeTo: unknown, onSuccess: (x: number, y: number, width: number, height: number) => void) => void;
};


/**
 * A sheet's scrolling body. Shrinks to the room the sheet has (so the actions after it stay
 * pinned), and keeps the focused field in view: when the keyboard opens or the body shrinks, it
 * scrolls just enough to show the field. The field is never left behind the keyboard.
 */
export function SheetScrollView({
  ref: outerRef,
  onScroll,
  onLayout,
  style,
  children,
  ...props
}: ScrollViewProps & { ref?: React.Ref<React.ComponentRef<typeof ScrollView>> }) {
  const ref = React.useRef<React.ComponentRef<typeof ScrollView>>(null);
  // Both this view and the caller (scrolling to the newest message, say) hold the scroll view.
  const setRef = React.useCallback(
    (node: React.ComponentRef<typeof ScrollView> | null) => {
      ref.current = node;
      if (typeof outerRef === 'function') outerRef(node);
      else if (outerRef) outerRef.current = node;
    },
    [outerRef],
  );
  const offset = React.useRef(0);
  const viewport = React.useRef(0);

  const revealFocused = React.useCallback(() => {
    const scroll = ref.current;
    // The browser keeps a focused field in view on its own (and has no focused-input lookup).
    if (Platform.OS === 'web') return;
    const field = TextInput.State?.currentlyFocusedInput?.() as unknown as Measurable | null;
    const content = scroll?.getInnerViewRef?.();
    if (!scroll || !field?.measureLayout || !content) return;
    try {
      field.measureLayout(content, (_x: number, y: number, _w: number, h: number) => {
        const to = revealOffset(y, h, offset.current, viewport.current);
        if (to !== null) scroll.scrollTo({ y: to, animated: true });
      });
    } catch {
      // The field isn't inside this sheet: nothing to scroll.
    }
  }, []);

  React.useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', revealFocused);
    return () => show.remove();
  }, [revealFocused]);

  return (
    <ScrollView
      ref={setRef}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={[{ flexShrink: 1 }, style]}
      scrollEventThrottle={32}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offset.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
      // The body shrinks while the keyboard opens: check again once it has its new size.
      onLayout={(e: LayoutChangeEvent) => {
        viewport.current = e.nativeEvent.layout.height;
        revealFocused();
        onLayout?.(e);
      }}
      {...props}>
      {children}
    </ScrollView>
  );
}
