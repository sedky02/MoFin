import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { VoiceTip } from '@/components/shell/voice-tip';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { Mic, Plus } from '@/lib/icons';
import { voiceOverlay } from '@/lib/voice-overlay';
import { cn } from '@/lib/utils';
import { COLORS } from '@/theme/colors';

/** Holding Add this long opens the voice overlay instead of the form. */
export const VOICE_HOLD_MS = 350;

export const ADD_ROUTE = 'add';

/**
 * Press feedback stays inside each button (the stock bar's borderless Android ripple spread past
 * the bar). The current tab gets a pill; Add is a filled circle, the main action.
 */
export function AppTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { colorScheme } = useColorScheme();
  const c = COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  const active = colorScheme === 'dark' ? c.primary : c['primary-text'];
  // Once Add has been held, the "hold for voice" tip has done its job.
  const [held, setHeld] = React.useState(false);
  const openVoice = () => {
    haptics.hold();
    setHeld(true);
    voiceOverlay.open();
  };

  return (
    <View
      role="tablist"
      className="flex-row border-t border-border bg-card px-1"
      style={{ paddingTop: 6, paddingBottom: 6 + insets.bottom }}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label = typeof options.title === 'string' ? options.title : route.name;
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        const onLongPress = () => emitter.emit({ type: 'tabLongPress', target: route.key });

        if (route.name === ADD_ROUTE) {
          // Tap: the add form, as before. Hold: the voice overlay, over the current screen.
          return (
            <View key={route.key} className="flex-1 items-center justify-center">
              <VoiceTip dismissed={held} />
              <Pressable
                role="button"
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                accessibilityHint="Hold to add or ask with your voice"
                accessibilityActions={[{ name: 'longpress', label: 'Add or ask with your voice' }]}
                onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && openVoice()}
                onPress={onPress}
                onLongPress={openVoice}
                delayLongPress={VOICE_HOLD_MS}
                className="size-12 items-center justify-center rounded-full bg-primary shadow-sm shadow-black/20 active:opacity-80">
                <Plus size={26} strokeWidth={2.5} color={c['primary-foreground']} />
                {/* A small mic on the corner says the button also listens when held. */}
                <View
                  aria-hidden
                  className="absolute -bottom-0.5 -right-0.5 size-[18px] items-center justify-center rounded-full border-2 border-card bg-foreground">
                  <Mic size={9} strokeWidth={2.75} color={c.card} />
                </View>
              </Pressable>
            </View>
          );
        }

        const color = focused ? active : c['muted-foreground'];
        return (
          <Pressable
            key={route.key}
            role="tab"
            aria-selected={focused}
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            onPress={onPress}
            onLongPress={onLongPress}
            className="min-h-[52px] flex-1 items-center justify-center gap-1 rounded-xl active:opacity-70">
            <View className={cn('h-8 w-14 items-center justify-center rounded-full', focused && 'bg-primary/15')}>
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              {options.tabBarBadge !== undefined ? (
                <View aria-hidden className="absolute right-1.5 top-0 min-w-[18px] items-center rounded-full border-2 border-card bg-destructive px-1">
                  <Text className="text-[10px] font-bold leading-[14px] text-destructive-foreground">{String(options.tabBarBadge)}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ color }} className={cn('text-[11px] leading-[14px]', focused ? 'font-semibold' : 'font-medium')}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
