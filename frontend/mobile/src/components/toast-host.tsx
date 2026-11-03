// Renders the toasts from src/lib/toast.ts: stacked above the tab bar / home indicator, announced to
// screen readers, auto-dismissed (a timer per toast, restarted when the same id is shown again).
import { CircleAlert, CircleCheck, X } from 'lucide-react-native';
import * as React from 'react';
import { AccessibilityInfo, Platform, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { dismissToast, getToasts, subscribeToasts, type ToastItem } from '@/lib/toast';
import { cn } from '@/lib/utils';

/** What a screen reader says for a toast. */
export function toastAnnouncement(t: Pick<ToastItem, 'kind' | 'message' | 'description'>): string {
  const prefix = t.kind === 'error' ? 'Error: ' : '';
  return `${prefix}${t.message}${t.description ? `. ${t.description}` : ''}`;
}

function ToastView({ toast: t }: { toast: ToastItem }) {
  const isError = t.kind === 'error';

  // Restarts when the toast object changes, which is what a repeated id produces.
  React.useEffect(() => {
    AccessibilityInfo.announceForAccessibility(toastAnnouncement(t));
    if (!Number.isFinite(t.duration)) return;
    const timer = setTimeout(() => dismissToast(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [t]);

  return (
    <Animated.View
      entering={FadeInDown.reduceMotion(ReduceMotion.System)}
      exiting={FadeOutDown.reduceMotion(ReduceMotion.System)}
      // Animated views take no className (web drops it), so the card is the plain View inside.
      style={{ width: '100%', maxWidth: 448 }}>
      <View
        // Web has no announceForAccessibility; the live region covers it.
        role={isError ? 'alert' : 'status'}
        accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
        className={cn(
          'w-full flex-row items-start gap-3 rounded-lg border bg-popover px-4 py-3 shadow-lg shadow-black/10',
          isError ? 'border-destructive/50' : 'border-border',
        )}>
        <Icon
          as={isError ? CircleAlert : CircleCheck}
          size={20}
          aria-hidden
          className={cn('mt-0.5', isError ? 'text-destructive' : 'text-success')}
        />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-medium text-popover-foreground">{t.message}</Text>
          {t.description ? <Text className="text-xs text-muted-foreground">{t.description}</Text> : null}
          {t.action || t.cancel ? (
            <View className="mt-2 flex-row gap-4">
              {t.cancel ? (
                <Pressable
                  role="button"
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  className="min-h-8 justify-center"
                  onPress={() => {
                    t.cancel?.onClick();
                    dismissToast(t.id);
                  }}>
                  <Text className="text-sm font-medium text-muted-foreground">{t.cancel.label}</Text>
                </Pressable>
              ) : null}
              {t.action ? (
                <Pressable
                  role="button"
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  className="min-h-8 justify-center"
                  onPress={() => {
                    t.action?.onClick();
                    dismissToast(t.id);
                  }}>
                  <Text className="text-sm font-semibold text-primary-text">{t.action.label}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
        <Pressable
          role="button"
          accessibilityLabel="Dismiss notification"
          hitSlop={12}
          className="size-6 items-center justify-center"
          onPress={() => dismissToast(t.id)}>
          <Icon as={X} size={16} aria-hidden className="text-muted-foreground" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function ToastHost() {
  const toasts = React.useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center gap-2 px-4"
      // Above the tab bar (about 56pt plus the bottom inset).
      style={{ bottom: insets.bottom + (Platform.OS === 'web' ? 72 : 64) }}>
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} />
      ))}
    </View>
  );
}
