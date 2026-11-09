import { useColorScheme } from 'nativewind';
import { Pressable, View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Account, Goal } from '@/core/types';
import { Check, MoreVertical } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { goalRowModel } from './goal-model';
import { toneColor } from './goal-ring';

const FIGURE_COLOR: Partial<Record<string, string>> = {
  failed: 'text-destructive',
  behind: 'text-warning',
  achieved: 'text-primary-text dark:text-primary',
};

/**
 * One goal as a card, like the web's: name, the big figure (left / over / to go / above) with its
 * target and the real amounts, badges for what it counts and when, and a bar. An achieved goal folds
 * to one line. Pressing it opens the goal's actions.
 */
export function GoalRow({
  goal,
  account,
  showAccount = false,
  onOpenActions,
  busy = false,
}: {
  goal: Goal;
  account?: Account;
  /** Name the account on Income/Expense goals too (it's always named on a Balance goal). */
  showAccount?: boolean;
  onOpenActions: (goal: Goal) => void;
  busy?: boolean;
}) {
  const { colorScheme } = useColorScheme();
  const m = goalRowModel(goal, account);
  // Nested Text doesn't inherit size here, so each part gets it.
  const figure = (size: string) =>
    m.headline ? (
      <Text className={cn('font-semibold tracking-tight', size, FIGURE_COLOR[m.tone])}>
        <MoneyAmount amount={m.headline.amount} currency={m.currency} className={cn('font-semibold', size, FIGURE_COLOR[m.tone])} />{' '}
        {m.headline.label}
      </Text>
    ) : null;
  const amounts = (
    <Text className="text-xs text-muted-foreground">
      <MoneyAmount amount={m.progressAmount} currency={m.currency} className="text-xs font-medium text-foreground" />
      {' / '}
      <MoneyAmount amount={m.targetAmount} currency={m.currency} className="text-xs text-muted-foreground" />
    </Text>
  );
  const label = `${goal.name}. ${m.headline ? `${m.headline.amount} ${m.headline.label}, ${m.targetLine}` : ''}. ${[m.reason, m.category?.name, m.period].filter(Boolean).join(', ')}`;

  const showsAccount = !!account && (goal.type === 'BALANCE' || showAccount);
  // One quiet line instead of wrapping pills: the reason (coloured) leads, then what it counts and when.
  const meta = (
    <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {m.reason ? (
        <Text className={cn('text-xs font-semibold', m.tone === 'failed' ? 'text-destructive' : 'text-amber-800 dark:text-warning')}>
          {m.reason}
        </Text>
      ) : null}
      {m.category ? (
        <View className="flex-row items-center gap-1">
          {m.reason ? <Text className="text-xs text-muted-foreground">·</Text> : null}
          <View
            aria-hidden
            className={cn('size-1.5 rounded-full', !m.category.color && 'bg-muted-foreground/60')}
            style={m.category.color ? { backgroundColor: m.category.color } : undefined}
          />
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {m.category.name}
          </Text>
        </View>
      ) : null}
      {[showsAccount ? account!.name : null, m.period]
        .filter(Boolean)
        .map((part, i) => (
          <Text key={i} numberOfLines={1} className="text-xs text-muted-foreground">
            {m.reason || m.category || i > 0 ? '· ' : ''}
            {part}
          </Text>
        ))}
    </View>
  );

  if (m.folded) {
    return (
      <Pressable
        role="button"
        testID={`goal-row-${goal.id}`}
        accessibilityLabel={label}
        accessibilityHint="Opens actions for this goal"
        onPress={() => onOpenActions(goal)}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 active:bg-accent/50">
        <View aria-hidden className="size-8 items-center justify-center rounded-full bg-accent">
          <Icon as={Check} size={16} className="text-accent-foreground" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-base font-medium">
            {goal.name}
          </Text>
          {meta}
        </View>
        {figure('text-sm')}
      </Pressable>
    );
  }

  return (
    <Pressable
      role="button"
      testID={`goal-row-${goal.id}`}
      accessibilityLabel={label}
      accessibilityHint="Opens actions for this goal"
      aria-busy={busy || undefined}
      onPress={() => onOpenActions(goal)}
      className={cn(
        'gap-2.5 rounded-2xl border border-border bg-card px-4 pt-3 pb-3.5 active:bg-accent/50',
        (busy || goal.archivedAt) && 'opacity-70',
      )}>
      <View className="flex-row items-center gap-3">
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-medium">
          {goal.name}
        </Text>
        <Icon as={MoreVertical} size={18} className="-mr-1 text-muted-foreground" />
      </View>

      <View className="flex-row items-end justify-between gap-3">
        {figure('text-xl')}
        <View className="shrink-0 pb-0.5">{amounts}</View>
      </View>

      <View className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
        <View
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, m.ratio))}%`, backgroundColor: toneColor(m.tone, colorScheme === 'dark' ? 'dark' : 'light') }}
        />
      </View>

      {meta}
    </Pressable>
  );
}
