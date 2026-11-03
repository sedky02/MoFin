// A minimal toast view behind the `toast` facade (src/lib/toast.ts), so errors from handleApiError
// are visible on the auth screens. One toast at a time; a toast with the same id replaces itself.
// TODO(Phase 5): replace with the UI kit's toast (stacking, swipe to dismiss, enter/exit motion).
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { setToastSink } from '@/lib/toast';
import { cn } from '@/lib/utils';

type ToastItem = {
  key: number;
  kind: 'success' | 'error';
  message: string;
  description?: string;
  duration: number;
  action?: { label: string; onClick: () => void };
};

const DEFAULT_DURATION_MS = 4_000;

export function ToastHost() {
  const [toast, setToast] = React.useState<ToastItem | null>(null);
  const insets = useSafeAreaInsets();
  const nextKey = React.useRef(0);

  React.useEffect(() => {
    setToastSink((kind, message, options) => {
      nextKey.current += 1;
      setToast({
        key: nextKey.current,
        kind,
        message,
        description: options?.description,
        duration: options?.duration ?? DEFAULT_DURATION_MS,
        action: options?.action,
      });
    });
    return () => setToastSink(() => {});
  }, []);

  React.useEffect(() => {
    if (!toast || !Number.isFinite(toast.duration)) return;
    const timer = setTimeout(() => setToast((t) => (t?.key === toast.key ? null : t)), toast.duration);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center px-4"
      style={{ bottom: insets.bottom + 16 }}>
      <View
        role="alert"
        accessibilityLiveRegion="polite"
        className={cn(
          'w-full max-w-sm flex-row items-start gap-3 rounded-lg border bg-popover px-4 py-3 shadow-lg shadow-black/10',
          toast.kind === 'error' ? 'border-destructive/40' : 'border-border',
        )}>
        <View className="flex-1 gap-0.5">
          <Text className={cn('text-sm font-medium', toast.kind === 'error' ? 'text-destructive' : 'text-popover-foreground')}>
            {toast.message}
          </Text>
          {toast.description ? <Text className="text-xs text-muted-foreground">{toast.description}</Text> : null}
        </View>
        {toast.action ? (
          <Pressable
            role="button"
            hitSlop={8}
            onPress={() => {
              toast.action?.onClick();
              setToast(null);
            }}>
            <Text className="text-sm font-semibold text-primary-text">{toast.action.label}</Text>
          </Pressable>
        ) : null}
        <Pressable role="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={() => setToast(null)}>
          <Text className="text-sm text-muted-foreground">✕</Text>
        </Pressable>
      </View>
    </View>
  );
}
