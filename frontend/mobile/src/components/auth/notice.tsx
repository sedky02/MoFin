import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const STYLES = {
  success: { box: 'border-success/30 bg-success/10', text: 'text-success' },
  error: { box: 'border-destructive/30 bg-destructive/10', text: 'text-destructive' },
  info: { box: 'border-border bg-muted', text: 'text-foreground' },
} as const;

/** A banner above a form (account created, session expired, too many attempts). */
export function Notice({ kind, children, className }: { kind: keyof typeof STYLES; children: string; className?: string }) {
  const s = STYLES[kind];
  return (
    <View
      role={kind === 'error' ? 'alert' : 'status'}
      accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
      className={cn('mb-5 rounded-lg border px-3.5 py-3', s.box, className)}>
      <Text className={cn('text-sm leading-5', s.text)}>{children}</Text>
    </View>
  );
}
