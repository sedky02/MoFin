import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * A round icon button for headers and toolbars. The press feedback is a fill inside the circle
 * (no borderless Android ripple, which spread past the bar it sat in).
 */
export function HeaderIconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled,
  className,
}: {
  icon: LucideIcon;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      className={cn('size-10 items-center justify-center rounded-full bg-secondary active:bg-accent', disabled && 'opacity-30', className)}>
      <Icon as={icon} size={20} aria-hidden className="text-foreground" />
    </Pressable>
  );
}

/**
 * One header for tabs and pushed screens: optional leading button, title, trailing content.
 * `insetTop` adds the status bar height (off for a modal sheet that doesn't reach the top).
 */
export function HeaderBar({
  title,
  left,
  right,
  insetTop = true,
}: {
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  insetTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="min-h-14 flex-row items-center gap-3 border-b border-border bg-background px-4 pb-2.5"
      style={{ paddingTop: (insetTop ? insets.top : 0) + 10 }}>
      {left}
      <Text role="heading" aria-level={1} numberOfLines={1} className="min-w-0 shrink text-xl font-semibold tracking-tight">
        {title}
      </Text>
      {right ? <View className="min-w-0 flex-1 flex-row items-center justify-end gap-2">{right}</View> : null}
    </View>
  );
}
