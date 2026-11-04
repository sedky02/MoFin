import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { THEME_LABELS, useThemePreference, type ThemePreference } from '@/hooks/use-theme-preference';
import { Check, Monitor, Moon, Sun } from '@/lib/icons';
import { cn } from '@/lib/utils';

// The previews' colors are the palette's page, card and line tones (as on the web's ThemeSetting),
// fixed so each preview shows its own theme whatever the current one is.
const PREVIEW = {
  light: { page: 'bg-[#fafaf9]', card: 'bg-white', line: 'bg-[#d4d4d4]' },
  dark: { page: 'bg-[#050505]', card: 'bg-[#1c1b1b]', line: 'bg-[#55585a]' },
} as const;

// "System" is mobile only: phones switch light and dark on a schedule, and the app follows by default.
const OPTIONS: { value: ThemePreference; icon: LucideIcon }[] = [
  { value: 'system', icon: Monitor },
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
];

function Preview({ tone }: { tone: 'light' | 'dark' }) {
  const p = PREVIEW[tone];
  return (
    <View className={cn('flex-1 p-1.5', p.page)}>
      <View className={cn('gap-1.5 rounded-md p-1.5', p.card)}>
        <View className={cn('h-1.5 w-1/2 rounded-full', p.line)} />
        <View className={cn('h-1.5 w-3/4 rounded-full opacity-60', p.line)} />
        <View className="h-1.5 w-1/3 rounded-full bg-[#a3e635]" />
      </View>
    </View>
  );
}

/** System, light or dark, with a small preview of each. Applies at once and is kept on this device. */
export function ThemeSetting() {
  const { preference, setPreference } = useThemePreference();
  return (
    <View>
      <Text role="heading" aria-level={3} nativeID="theme-label" className="text-sm font-medium">
        Appearance
      </Text>
      <View role="radiogroup" aria-labelledby="theme-label" className="mt-3 flex-row gap-3">
        {OPTIONS.map(({ value, icon }) => {
          const selected = preference === value;
          return (
            <Pressable
              key={value}
              role="radio"
              aria-checked={selected}
              accessibilityLabel={THEME_LABELS[value]}
              onPress={() => setPreference(value)}
              className={cn('flex-1 rounded-xl border-2 p-1.5', selected ? 'border-primary' : 'border-border')}>
              <View aria-hidden className="h-14 flex-row overflow-hidden rounded-lg">
                {value === 'system' ? (
                  <>
                    <Preview tone="light" />
                    <Preview tone="dark" />
                  </>
                ) : (
                  <Preview tone={value} />
                )}
              </View>
              <View className="mt-2 min-h-6 flex-row items-center gap-1.5 px-1">
                <Icon as={icon} size={16} aria-hidden className="text-muted-foreground" />
                <Text className="shrink text-sm font-medium">{THEME_LABELS[value]}</Text>
                {selected ? <Icon as={Check} size={16} aria-hidden className="ml-auto text-primary-text" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-3 text-sm text-muted-foreground">Applies right away, on this device.</Text>
    </View>
  );
}
