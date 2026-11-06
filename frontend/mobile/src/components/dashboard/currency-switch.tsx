import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export interface CurrencyOption {
  code: string;
  overdrawn?: boolean;
  activity?: boolean;
}

/**
 * Dashboard currency switch (shared by the balance hero and the monthly summary): pills that wrap,
 * one radio each. Renders nothing for a single currency.
 */
export function CurrencySwitch({
  currencies,
  value,
  onChange,
}: {
  currencies: CurrencyOption[];
  value: string;
  onChange: (currency: string) => void;
}) {
  if (currencies.length < 2) return null;
  return (
    <View role="radiogroup" accessibilityLabel="Currency" className="flex-row flex-wrap gap-1.5">
      {currencies.map((c) => {
        const selected = c.code === value;
        const extra = c.overdrawn ? ', overdrawn' : c.activity ? ', has activity this month' : '';
        return (
          <Pressable
            key={c.code}
            role="radio"
            aria-checked={selected}
            accessibilityState={{ selected }}
            accessibilityLabel={`${c.code}${extra}`}
            onPress={() => onChange(c.code)}
            className={cn(
              'min-h-11 min-w-11 flex-row items-center justify-center gap-1.5 rounded-full border px-3.5',
              selected ? 'border-primary bg-primary/15' : 'border-border',
            )}>
            <Text className={cn('text-xs font-medium', selected ? 'text-primary-text' : 'text-muted-foreground')}>{c.code}</Text>
            {c.overdrawn ? <View className="size-1.5 rounded-full bg-destructive" /> : null}
            {c.activity ? <View className="size-1.5 rounded-full bg-primary" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
