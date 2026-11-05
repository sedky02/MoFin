// Horizontal swipes: stepping through weeks and months, and moving between the tabs. Both follow the
// finger 1:1, resist where there is nothing further, and spring into place (critically damped, so
// nothing bounces). The buttons stay; a swipe is a faster way to do the same thing.
import * as React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import {
  GestureDetector,
  usePanGesture,
  type PanGesture,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { haptics } from "@/lib/haptics";

/** A step needs this much travel, or a flick at least this fast. */
const COMMIT_DISTANCE = 56;
const COMMIT_VELOCITY = 600;
/** How far the new content starts from, sliding in from the side the finger went to. */
const ENTER_OFFSET = 36;
const SPRING = { dampingRatio: 1, duration: 380 } as const;

/** Past an edge the element follows less and less, so it reads as "nothing more this way". */
function rubberband(
  distance: number,
  dimension = 320,
  constant = 0.55,
): number {
  "worklet";
  return (
    (distance * dimension * constant) /
    (dimension + constant * Math.abs(distance))
  );
}

// The tab swipe around a screen, so a stepper inside it can take priority.
const PageSwipeContext = React.createContext<PanGesture | null>(null);

/**
 * Swipe left for the next step, right for the previous one (weeks, months). Takes priority over the
 * tab swipe around it, and lets vertical scrolling through.
 */
export function SwipeStepper({
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
  style,
  className,
  children,
}: {
  onPrev: () => void;
  onNext: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
  children: React.ReactNode;
}) {
  const x = useSharedValue(0);
  const page = React.useContext(PageSwipeContext);

  const step = React.useCallback(
    (direction: "prev" | "next") => {
      haptics.tap();
      if (direction === "next") onNext();
      else onPrev();
    },
    [onNext, onPrev],
  );

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    // The tab swipe waits for this one to fail first.
    block: page ?? undefined,
    onUpdate: (e) => {
      "worklet";
      const dx = e.translationX;
      const allowed = dx < 0 ? canNext : canPrev;
      x.value = allowed ? dx : rubberband(dx);
    },
    onDeactivate: (e) => {
      "worklet";
      const dx = e.translationX;
      const vx = e.velocityX;
      const next = (dx < -COMMIT_DISTANCE || vx < -COMMIT_VELOCITY) && canNext;
      const prev = (dx > COMMIT_DISTANCE || vx > COMMIT_VELOCITY) && canPrev;
      if (next || prev) {
        // The new step comes in from the side the finger was heading to.
        x.value = next ? ENTER_OFFSET : -ENTER_OFFSET;
        scheduleOnRN(step, next ? "next" : "prev");
      }
      x.value = withSpring(0, SPRING);
    },
  });

  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    opacity: 1 - Math.min(Math.abs(x.value) / 400, 0.35),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, moving]} className={className}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/** The tabs a swipe moves through, in tab bar order (Add is an action, not a page). */
export const SWIPE_TABS = [
  "dashboard",
  "transactions",
  "drafts",
  "more",
] as const;
export type SwipeTab = (typeof SWIPE_TABS)[number];

/** The tab a swipe from `current` lands on, or null at either end. */
export function adjacentTab(
  current: string,
  direction: "prev" | "next",
): SwipeTab | null {
  const i = SWIPE_TABS.indexOf(current as SwipeTab);
  if (i < 0) return null;
  return SWIPE_TABS[i + (direction === "next" ? 1 : -1)] ?? null;
}

/**
 * Wraps a tab screen: swipe left for the next tab, right for the previous one. Needs a clearly
 * horizontal swipe, so vertical scrolling and taps are left alone.
 */
export function TabSwipe({
  tab,
  onNavigate,
  children,
}: {
  tab: string;
  onNavigate: (tab: SwipeTab) => void;
  children: React.ReactNode;
}) {
  const x = useSharedValue(0);
  const prev = adjacentTab(tab, "prev");
  const next = adjacentTab(tab, "next");

  const go = React.useCallback(
    (target: SwipeTab) => {
      haptics.tap();
      onNavigate(target);
    },
    [onNavigate],
  );

  const pan = usePanGesture({
    activeOffsetX: [-28, 28],
    failOffsetY: [-14, 14],
    onUpdate: (e) => {
      "worklet";
      const dx = e.translationX;
      const allowed = dx < 0 ? !!next : !!prev;
      // A hint of movement, not a full drag: the tab itself switches on release.
      x.value = allowed ? dx * 0.25 : rubberband(dx * 0.25, 200);
    },
    onDeactivate: (e) => {
      "worklet";
      const dx = e.translationX;
      const vx = e.velocityX;
      const target =
        (dx < -COMMIT_DISTANCE * 1.5 || vx < -COMMIT_VELOCITY * 1.2) && next
          ? next
          : (dx > COMMIT_DISTANCE * 1.5 || vx > COMMIT_VELOCITY * 1.2) && prev
            ? prev
            : null;
      if (target) scheduleOnRN(go, target);
      x.value = withSpring(0, SPRING);
    },
  });

  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <PageSwipeContext.Provider value={pan}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, moving]}>{children}</Animated.View>
      </GestureDetector>
    </PageSwipeContext.Provider>
  );
}
