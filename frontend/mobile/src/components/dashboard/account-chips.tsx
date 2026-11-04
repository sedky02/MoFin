import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';

import { TYPE_ICON } from '@/components/common/account-type-picker';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Account } from '@/core/types';
import { haptics } from '@/lib/haptics';
import { Layers, Plus } from '@/lib/icons';
import { cn } from '@/lib/utils';

function Chip({
  label,
  suffix,
  icon,
  selected,
  onPress,
}: {
  label: string;
  suffix?: string;
  icon: LucideIcon;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={suffix ? `${label}, ${suffix}` : label}
      onPress={onPress}
      className={cn(
        'min-h-11 flex-row items-center gap-2 rounded-full border px-4 active:opacity-70',
        selected ? 'border-primary bg-primary' : 'border-border bg-card',
      )}>
      <Icon as={icon} size={16} aria-hidden className={selected ? 'text-primary-foreground' : 'text-muted-foreground'} />
      <Text numberOfLines={1} className={cn('max-w-[160px] text-sm font-semibold', selected ? 'text-primary-foreground' : 'text-foreground')}>
        {label}
      </Text>
      {suffix ? (
        <Text className={cn('text-xs font-medium', selected ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{suffix}</Text>
      ) : null}
    </Pressable>
  );
}

/** The chip order: the chosen scope first (an account, or All accounts), then the rest in list order. */
export function chipOrder(accounts: Account[], value?: string): (Account | 'all')[] {
  const chosen = accounts.find((a) => a.id === value);
  if (!chosen) return ['all', ...accounts];
  return [chosen, 'all', ...accounts.filter((a) => a.id !== chosen.id)];
}

/**
 * The dashboard's account scope as a row of chips: the chosen one first, then All accounts and the
 * other accounts, one tap to switch, scrolling sideways when there are many, and a + at the end to
 * add an account. Replaces the dropdown in the header, which hid the choices behind a tap and read
 * as a form field. The currency shows only when accounts mix currencies.
 */
export function AccountChips({
  accounts,
  value,
  onChange,
  onAdd,
}: {
  accounts: Account[];
  value?: string;
  onChange: (accountId?: string) => void;
  /** The + chip: add an account. */
  onAdd?: () => void;
}) {
  const ref = React.useRef<ScrollViewInstance>(null);
  const mixed = new Set(accounts.map((a) => a.currency)).size > 1;
  const pick = (id?: string) => {
    if (id === value) return;
    haptics.tap();
    onChange(id);
  };

  // The chosen chip moves to the front, so bring the row back to its start.
  React.useEffect(() => {
    ref.current?.scrollTo({ x: 0, animated: true });
  }, [value]);

  // No accounts yet: the dashboard's setup handles that.
  if (accounts.length === 0) return null;

  return (
    <View role="radiogroup" accessibilityLabel="Show the dashboard for" className="-mx-4">
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
        {chipOrder(accounts, value).map((item) =>
          item === 'all' ? (
            <Chip key="all" label="All accounts" icon={Layers} selected={!value} onPress={() => pick(undefined)} />
          ) : (
            <Chip
              key={item.id}
              label={item.name}
              suffix={mixed ? item.currency : undefined}
              icon={TYPE_ICON[item.type]}
              selected={item.id === value}
              onPress={() => pick(item.id)}
            />
          ),
        )}
        {onAdd ? (
          <Pressable
            role="button"
            accessibilityLabel="Add an account"
            onPress={onAdd}
            className="size-11 items-center justify-center rounded-full border border-dashed border-border bg-card active:opacity-70">
            <Icon as={Plus} size={18} aria-hidden className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
