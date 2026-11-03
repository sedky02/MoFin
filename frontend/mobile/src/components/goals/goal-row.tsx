import { MoreVertical } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Account, Goal } from '@/core/types';
import { cn } from '@/lib/utils';

import { COLOURED_AMOUNT, goalRowModel } from './goal-model';
import { GoalRing } from './goal-ring';

const AMOUNT_COLOR: Partial<Record<string, string>> = {
  failed: 'text-destructive',
  behind: 'text-warning',
  achieved: 'text-success',
};

/**
 * One goal in a group's panel: progress ring, name and details, amounts and an actions button. The
 * group heading names the standing, so the row carries none of its own. Pressing the row opens the
 * goal's actions (history, edit, cancel / restore).
 */
export function GoalRow({
  goal,
  account,
  onOpenActions,
  busy = false,
}: {
  goal: Goal;
  account?: Account;
  onOpenActions: (goal: Goal) => void;
  busy?: boolean;
}) {
  const m = goalRowModel(goal, account);
  const amountColor = COLOURED_AMOUNT.includes(m.tone) ? AMOUNT_COLOR[m.tone] : undefined;
  return (
    <Pressable
      role="button"
      testID={`goal-row-${goal.id}`}
      accessibilityLabel={`${goal.name}, ${m.percent}%${m.overTarget ? ', over target' : ''}. ${m.details}. ${m.scope}`}
      accessibilityHint="Opens actions for this goal"
      aria-busy={busy || undefined}
      onPress={() => onOpenActions(goal)}
      className={cn('min-h-[88px] flex-row items-center gap-4 px-4 py-4 active:bg-accent/50', busy && 'opacity-60')}>
      <GoalRing ratio={m.ratio} percent={m.percent} tone={m.tone} overTarget={m.overTarget} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-base font-medium">
          {goal.name}
        </Text>
        <Text numberOfLines={2} className="text-sm text-muted-foreground">
          {m.details}
        </Text>
        <Text className="mt-0.5 text-base">
          <MoneyAmount
            amount={m.progressAmount}
            currency={m.currency}
            className={cn('font-semibold', amountColor)}
          />
          <Text className="text-muted-foreground">
            {' / '}
            <MoneyAmount amount={m.targetAmount} currency={m.currency} />
          </Text>
        </Text>
      </View>
      <View aria-hidden className="size-11 items-center justify-center">
        <Icon as={MoreVertical} size={18} className="text-muted-foreground" />
      </View>
    </Pressable>
  );
}
