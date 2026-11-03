import { router } from 'expo-router';
import { ArrowRight, Plus, Target } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { EmptyState, ErrorState } from '@/components/common/states';
import { GoalTilesSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { GoalRing } from '@/components/dashboard/goal-ring';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { tryParse } from '@/core/decimal';
import { goalPercent, goalProgressRatio } from '@/core/format';
import { goalTone, isOverLimit } from '@/core/goal-standing';
import { goalScopeLabel } from '@/core/goal-scope';
import type { Account, Goal } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useGoals } from '@/hooks/useGoals';

function GoalTile({ goal, account }: { goal: Goal; account?: Account }) {
  const currency = account?.currency ?? 'USD';
  const instance = goal.currentInstance;
  const ratio = instance ? goalProgressRatio(instance.progressAmount, instance.targetAmount) : 0;
  const percent = instance ? Math.min(100, goalPercent(instance.progressAmount, instance.targetAmount)) : 0;
  const over = isOverLimit(goal);
  const belowZero = !!instance && (tryParse(instance.progressAmount)?.isNegative() ?? false);
  return (
    <Pressable
      role="link"
      accessibilityLabel={`${goal.name}, ${percent}%${over ? ', over budget' : ''}. ${goalScopeLabel(goal.type, account?.name)}`}
      onPress={() => router.push('/goals')}
      className="min-h-11 flex-row items-center gap-3 rounded-xl bg-muted/35 p-4 active:bg-muted/70 dark:bg-muted">
      <GoalRing ratio={ratio} percent={percent} tone={goalTone(goal)} overTarget={over} size={48} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-semibold">
            {goal.name}
          </Text>
          {over ? (
            <Text className="text-xs font-medium text-destructive">Over budget</Text>
          ) : belowZero ? (
            <Text className="text-xs font-medium text-muted-foreground">Below zero</Text>
          ) : null}
        </View>
        <Text numberOfLines={1} className="mt-0.5 text-xs text-muted-foreground">
          <MoneyAmount amount={instance?.progressAmount ?? '0'} currency={currency} className="text-xs font-medium text-foreground" />
          {' / '}
          <MoneyAmount amount={goal.targetAmount} currency={currency} className="text-xs text-muted-foreground" />
        </Text>
      </View>
    </Pressable>
  );
}

/** Glanceable goals for the dashboard; editing, history and ending a goal live on the Goals tab. */
export function GoalsSummary({ accountId }: { accountId?: string }) {
  const { data: goals, isLoading, isError, refetch } = useGoals();
  const { data: accounts } = useAccounts('all');
  const byId = new Map((accounts ?? []).map((a) => [a.id, a]));
  const visible = (goals ?? []).filter((g) => !accountId || g.accountId === accountId).slice(0, 4);

  return (
    <View className="rounded-2xl bg-card p-5 shadow-sm shadow-black/5">
      <View className="mb-3 flex-row items-center justify-between">
        <Text role="heading" aria-level={2} className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Goals
        </Text>
        <Button variant="ghost" size="sm" className="-mr-2 min-h-11 gap-1" accessibilityLabel="View all goals" onPress={() => router.push('/goals')}>
          <Text className="text-xs">View all</Text>
          <Icon as={ArrowRight} size={14} aria-hidden />
        </Button>
      </View>
      {isLoading ? (
        <GoalTilesSkeleton />
      ) : isError ? (
        <ErrorState description="Couldn't load your goals." onRetry={() => refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Target}
          className="border-0 bg-transparent px-2 py-5"
          title="No goals yet"
          description={accountId ? 'This account has no goals yet.' : 'Set a target to start tracking progress.'}
          action={
            accounts && accounts.length === 0 ? (
              <Button size="lg" onPress={() => router.push('/accounts')}>
                <Text>Create an account first</Text>
              </Button>
            ) : (
              <Button size="lg" onPress={() => router.push('/goals')}>
                <Icon as={Plus} size={16} aria-hidden className="text-primary-foreground" />
                <Text>Create a goal</Text>
              </Button>
            )
          }
        />
      ) : (
        <View className="gap-3">
          {visible.map((g) => (
            <GoalTile key={g.id} goal={g} account={byId.get(g.accountId)} />
          ))}
        </View>
      )}
    </View>
  );
}
