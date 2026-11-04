import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useColorScheme } from 'nativewind';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Plus } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { COLORS } from '@/theme/colors';

/** The route that is an action (opens the add form) rather than a place; drawn as the raised + button. */
export const ADD_ROUTE = 'add';

/**
 * The bottom tab bar. The press feedback stays inside each button: the stock bar used a borderless
 * Android ripple whose circle spread past the bar. The current tab gets a pill behind its icon, and
 * Add is a filled circle in the middle, since it is the main action rather than a place.
 */
export function AppTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { colorScheme } = useColorScheme();
  const c = COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  const active = colorScheme === 'dark' ? c.primary : c['primary-text'];

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
          return (
            <View key={route.key} className="flex-1 items-center justify-center">
              <Pressable
                role="button"
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                onPress={onPress}
                onLongPress={onLongPress}
                className="size-12 items-center justify-center rounded-full bg-primary shadow-sm shadow-black/20 active:opacity-80">
                <Plus size={26} strokeWidth={2.5} color={c['primary-foreground']} />
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
