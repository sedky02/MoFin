import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ACCOUNT_TYPES } from '@/core/constants';
import type { AccountType } from '@/core/types';
import { Banknote, Bitcoin, Landmark, PiggyBank } from '@/lib/icons';
import { cn } from '@/lib/utils';

export const TYPE_ICON: Record<AccountType, LucideIcon> = {
  CASH: Banknote,
  BANK: Landmark,
  SAVINGS: PiggyBank,
  CRYPTO: Bitcoin,
};

export function AccountTypePicker({
  value,
  onChange,
  label = 'Type',
}: {
  value: AccountType;
  onChange: (type: AccountType) => void;
  label?: string;
}) {
  return (
    <View role="radiogroup" accessibilityLabel={label} className="flex-row gap-2">
      {ACCOUNT_TYPES.map((t) => {
        const selected = value === t.value;
        return (
          <Pressable
            key={t.value}
            role="radio"
            aria-checked={selected}
            accessibilityState={{ selected }}
            accessibilityLabel={t.label}
            onPress={() => onChange(t.value)}
            className={cn(
              'min-h-16 flex-1 items-center justify-center gap-1.5 rounded-lg border-2 bg-card px-1 py-2.5',
              selected ? 'border-primary' : 'border-border',
            )}>
            <Icon as={TYPE_ICON[t.value]} size={20} aria-hidden className={selected ? 'text-foreground' : 'text-muted-foreground'} />
            <Text numberOfLines={1} className={cn('text-xs font-medium', selected ? 'text-foreground' : 'text-muted-foreground')}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
