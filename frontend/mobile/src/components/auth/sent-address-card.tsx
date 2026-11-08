import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Mail } from '@/lib/icons';

export const RESEND_COOLDOWN_S = 60;

/** The address a link went to, what the link allows, and a way to change it. */
export function SentAddressCard({ email, meta, onChange }: { email: string; meta: string; onChange: () => void }) {
  return (
    <View className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5">
      <View className="size-10 items-center justify-center rounded-xl bg-primary/15">
        <Icon as={Mail} size={18} className="text-primary-text" />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} className="text-[15px] font-semibold text-foreground">
          {email || 'your address'}
        </Text>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} className="mt-0.5 text-[13px] text-muted-foreground">
          {meta}
        </Text>
      </View>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={onChange}>
        <Text className="text-sm font-semibold text-primary-text">Change</Text>
      </Pressable>
    </View>
  );
}

export function useCooldown(initialSeconds: number) {
  const [seconds, setSeconds] = React.useState(initialSeconds);
  React.useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return { seconds, restart: () => setSeconds(RESEND_COOLDOWN_S) };
}

export function resendLabel(label: string, sending: boolean, cooldown: number): string {
  if (sending) return 'Sending…';
  return cooldown > 0 ? `${label} in ${cooldown}s` : label;
}
