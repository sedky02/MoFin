import * as React from 'react';
import { ThemedRefreshControl } from '@/components/ui/themed-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { groupCancelledGoals } from '@/core/cancelled-goals';
import { groupGoalsByStanding, STANDING_LABEL } from '@/core/goal-standing';
import type { Account, Goal } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { canPost } from '@/core/account-sharing';
import { useArchiveGoal, useGoals, useRestoreGoal } from '@/hooks/useGoals';
import { Ban, ArrowLeft, History, Pencil, Plus, RotateCcw, Target } from '@/lib/icons';

import { GoalDialog } from './goal-dialog';
import { GoalHistoryDialog } from './goal-history-dialog';
import { GoalRow } from './goal-row';

/** A group of goal cards under a heading with its count, like the web's "Needs attention · 2". */
function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <View accessibilityLabel={title} className="gap-3">
      <Text role="heading" aria-level={2} className="px-1 text-[13px] font-semibold text-muted-foreground">
        {count === undefined ? title : `${title} · ${count}`}
      </Text>
      <View className="gap-3">{children}</View>
    </View>
  );
}

function ActionsDialog({
  goal,
  onClose,
  onHistory,
  onEdit,
  onStop,
  onRestore,
  canChange,
}: {
  goal?: Goal;
  onClose: () => void;
  onHistory: (g: Goal) => void;
  onEdit: (g: Goal) => void;
  onStop: (g: Goal) => void;
  onRestore: (g: Goal) => void;
  /** False on a view-only account. */
  canChange: boolean;
}) {
  const cancelled = !!goal?.archivedAt;
  const items = goal
    ? [
        { label: 'View history', icon: History, run: () => onHistory(goal), destructive: false },
        ...(!canChange
          ? []
          : cancelled
            ? [{ label: 'Restore', icon: RotateCcw, run: () => onRestore(goal), destructive: false }]
            : [
                { label: 'Edit', icon: Pencil, run: () => onEdit(goal), destructive: false },
                { label: 'Cancel goal', icon: Ban, run: () => onStop(goal), destructive: true },
              ]),
      ]
    : [];
  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-2 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle numberOfLines={1}>{goal?.name}</DialogTitle>
          <DialogDescription>Choose what to do with this goal.</DialogDescription>
        </DialogHeader>
        {items.map((item) => (
          <Button
            key={item.label}
            variant="outline"
            className="min-h-12 justify-start gap-3"
            accessibilityLabel={item.label}
            onPress={() => {
              onClose();
              item.run();
            }}>
            <Icon as={item.icon} size={18} className={item.destructive ? 'text-destructive' : 'text-muted-foreground'} />
            <Text className={item.destructive ? 'text-destructive' : undefined}>{item.label}</Text>
          </Button>
        ))}
      </DialogContent>
    </Dialog>
  );
}

export function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const [view, setView] = React.useState<'active' | 'cancelled'>('active');
  const active = useGoals('active');
  const cancelled = useGoals('archived');
  const { data: accounts } = useAccounts('all');
  const stopMut = useArchiveGoal();
  const restoreMut = useRestoreGoal();
  const cancelledCount = cancelled.data?.length ?? 0;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Goal | undefined>();
  const [toStop, setToStop] = React.useState<Goal | undefined>();
  const [historyGoal, setHistoryGoal] = React.useState<Goal | undefined>();
  const [actionsGoal, setActionsGoal] = React.useState<Goal | undefined>();

  const accountsById = React.useMemo(() => new Map<string, Account>((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }
  function openEdit(goal: Goal) {
    setEditing(goal);
    setDialogOpen(true);
  }
  function confirmStop() {
    if (!toStop) return;
    stopMut.mutate(toStop.id);
    setToStop(undefined);
  }

  const restoringId = (restoreMut.isPending && restoreMut.variables) || undefined;
  const list = view === 'active' ? active : cancelled;
  // "Cancelled" only once there is something to show (kept while loading or on error).
  const showCancelled = !(cancelled.isSuccess && cancelledCount === 0);
  // With no active goals the empty state carries the one New goal button.
  const showNew = !(view === 'active' && active.isSuccess && (active.data ?? []).length === 0);
  const showToolbar = view === 'cancelled' || showCancelled || showNew;
  const newButton = (
    <Button onPress={openCreate} className="min-h-11 gap-2" accessibilityLabel="New goal">
      <Icon as={Plus} size={16} className="text-primary-foreground" />
      <Text>New goal</Text>
    </Button>
  );

  const renderRow = (goal: Goal) => (
    <GoalRow
      key={goal.id}
      goal={goal}
      account={accountsById.get(goal.accountId)}
      showAccount={accountsById.size > 1}
      onOpenActions={setActionsGoal}
      busy={restoringId === goal.id}
    />
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="mx-auto w-full max-w-3xl p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}
      refreshControl={<ThemedRefreshControl refreshing={list.isRefetching && !list.isLoading} onRefresh={async () => void (await list.refetch())} />}>

      {showToolbar ? (
        <View className="mb-5 flex-row flex-wrap gap-2">
          {view === 'active' ? (
            showCancelled ? (
              <Button variant="outline" className="min-h-11 gap-2" onPress={() => setView('cancelled')}>
                <Icon as={Ban} size={16} aria-hidden />
                <Text>{cancelledCount > 0 ? `Cancelled (${cancelledCount})` : 'Cancelled'}</Text>
              </Button>
            ) : null
          ) : (
            <Button variant="outline" className="min-h-11 gap-2" onPress={() => setView('active')}>
              <Icon as={ArrowLeft} size={16} aria-hidden />
              <Text>Back to goals</Text>
            </Button>
          )}
          {showNew ? newButton : null}
        </View>
      ) : null}

      {view === 'active' ? (
        active.isLoading ? (
          <SkeletonRows rows={4} />
        ) : active.isError ? (
          <ErrorState description="Couldn't load your goals." onRetry={() => active.refetch()} />
        ) : (active.data ?? []).length === 0 ? (
          <EmptyState
            icon={Target}
            title="No active goals"
            description="Set a balance, income or expense target to start tracking progress."
            action={newButton}
          />
        ) : (
          <View className="gap-8">
            {groupGoalsByStanding(active.data ?? []).map(({ standing, goals }) => (
              <Panel key={standing} title={STANDING_LABEL[standing]} count={goals.length}>
                {goals.map(renderRow)}
              </Panel>
            ))}
          </View>
        )
      ) : cancelled.isLoading ? (
        <SkeletonRows rows={4} />
      ) : cancelled.isError ? (
        <ErrorState description="Couldn't load your cancelled goals." onRetry={() => cancelled.refetch()} />
      ) : cancelledCount === 0 ? (
        <EmptyState icon={Target} title="No cancelled goals" description="Goals you cancel will show up here, and can be restored." />
      ) : (
        <View className="gap-8">
          {groupCancelledGoals(cancelled.data ?? []).map((group) => (
            <Panel key={group.key} title={group.label}>
              {group.goals.map(renderRow)}
            </Panel>
          ))}
        </View>
      )}

      <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} goal={editing} />

      <ActionsDialog
        goal={actionsGoal}
        onClose={() => setActionsGoal(undefined)}
        onHistory={setHistoryGoal}
        onEdit={openEdit}
        onStop={setToStop}
        onRestore={(g) => restoreMut.mutate(g.id)}
        canChange={!actionsGoal || canPost(accountsById.get(actionsGoal.accountId))}
      />

      <GoalHistoryDialog
        goal={historyGoal}
        account={historyGoal ? accountsById.get(historyGoal.accountId) : undefined}
        onClose={() => setHistoryGoal(undefined)}
      />

      <ConfirmDialog
        open={!!toStop}
        onOpenChange={(o) => !o && setToStop(undefined)}
        title={`Cancel "${toStop?.name}"?`}
        description="Stops tracking and moves it to Cancelled, with its progress as it is now. Its history is kept. You can restore it later; it restarts from that day."
        confirmLabel="Cancel goal"
        cancelLabel="Keep goal"
        onConfirm={confirmStop}
      />
    </ScrollView>
  );
}
