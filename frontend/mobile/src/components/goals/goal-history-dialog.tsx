import { ScrollView, useWindowDimensions, View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';
import { formatPeriodDate } from '@/core/format';
import { goalProgressSourceLabel } from '@/core/goal-scope';
import type { Account, Goal, GoalStatus } from '@/core/types';
import { useGoalHistory } from '@/hooks/useGoals';
import { History } from '@/lib/icons';
import { cn } from '@/lib/utils';

const STATUS: Record<GoalStatus, { label: string; bg: string; text: string }> = {
  IN_PROGRESS: { label: 'In progress', bg: 'bg-warning/15', text: 'text-warning' },
  ACHIEVED: { label: 'Achieved', bg: 'bg-success/15', text: 'text-success' },
  FAILED: { label: 'Failed', bg: 'bg-destructive/15', text: 'text-destructive' },
};

export function GoalStatusBadge({ status }: { status: GoalStatus }) {
  const s = STATUS[status];
  return (
    <View className={cn('self-start rounded-md px-2 py-0.5', s.bg)}>
      <Text className={cn('text-xs font-medium', s.text)}>{s.label}</Text>
    </View>
  );
}

function HistoryBody({ goal, account }: { goal: Goal; account?: Account }) {
  const currency = account?.currency ?? 'USD';
  const { data, isLoading, isError, refetch } = useGoalHistory(goal.id, true);
  if (isLoading) return <SkeletonRows rows={3} />;
  if (isError) return <ErrorState description="Couldn't load this goal's history." onRetry={() => refetch()} />;
  if (!data || data.length === 0) {
    return <EmptyState icon={History} title="No periods yet" description="This goal hasn't tracked a period yet." />;
  }
  return (
    <View className="gap-2">
      {data.map((instance) => (
        <View
          key={instance.id}
          testID="goal-history-row"
          className="gap-1 rounded-xl bg-muted/50 px-3 py-3">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="min-w-0 flex-1 text-sm">
              {formatPeriodDate(instance.periodStart)} – {formatPeriodDate(instance.periodEnd)}
            </Text>
            <GoalStatusBadge status={instance.status} />
          </View>
          <Text testID="goal-history-source" className="text-xs text-muted-foreground">
            {goalProgressSourceLabel(instance.progressSource)}
          </Text>
          <Text className="text-sm">
            <MoneyAmount amount={instance.progressAmount} currency={currency} />
            <Text className="text-muted-foreground">
              {' / '}
              <MoneyAmount amount={instance.targetAmount} currency={currency} />
            </Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

export function GoalHistoryDialog({
  goal,
  account,
  onClose,
}: {
  goal?: Goal;
  account?: Account;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg" style={{ maxHeight: height - 32 }}>
        <DialogHeader className="border-b border-border px-4 py-3 pr-12">
          <DialogTitle>{goal?.name} — history</DialogTitle>
          <DialogDescription>
            Newest first. Finished periods keep the result recorded when they ended; editing an old transaction only
            changes the current period.
          </DialogDescription>
        </DialogHeader>
        <ScrollView style={{ flexShrink: 1 }} contentContainerClassName="px-4 py-4">
          {goal ? <HistoryBody goal={goal} account={account} /> : null}
        </ScrollView>
        <View className="flex-row justify-end border-t border-border px-4 py-3">
          <Button variant="ghost" className="min-h-11" onPress={onClose} accessibilityLabel="Close">
            <Text>Close</Text>
          </Button>
        </View>
      </DialogContent>
    </Dialog>
  );
}
