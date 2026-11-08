"use client";

import { GoalCardsSkeleton } from "@/components/common/page-skeletons";
import * as React from "react";
import { Ban, ArrowLeft, Plus, Target } from "lucide-react";
import { useGoals, useArchiveGoal, useRestoreGoal } from "@/hooks/useGoals";
import { useAccounts } from "@/hooks/useAccounts";
import { canPost } from "@/lib/account-sharing";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { CancelledGoalsList } from "@/components/goals/cancelled-goals-list";
import { GoalHistoryDialog } from "@/components/goals/goal-history-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { groupGoalsByStanding, STANDING_LABEL } from "@/lib/goal-standing";
import type { Goal } from "@/lib/types";

export default function GoalsPage() {
  const [view, setView] = React.useState<"active" | "cancelled">("active");

  const active = useGoals("active");
  const cancelled = useGoals("archived");
  const { data: accounts } = useAccounts("all");
  const stopMut = useArchiveGoal();
  const restoreMut = useRestoreGoal();
  const cancelledCount = cancelled.data?.length ?? 0;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Goal | undefined>();
  const [toStop, setToStop] = React.useState<Goal | undefined>();
  const [historyGoal, setHistoryGoal] = React.useState<Goal | undefined>();

  const [optimisticActive, removeOptimistic] = React.useOptimistic(
    active.data ?? [],
    (state: Goal[], id: string) => state.filter((g) => g.id !== id),
  );

  const showAccount = (accounts?.length ?? 0) > 1;
  const accountsById = React.useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a])),
    [accounts],
  );

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
    const id = toStop.id;
    setToStop(undefined);
    React.startTransition(async () => {
      removeOptimistic(id);
      await stopMut.mutateAsync(id).catch(() => {});
    });
  }

  return (
    <>
      <PageHeader
        title="Goals"
        description="Balance, income and expense targets tracked against your ledger."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {view === "active" ? (
              <Button variant="outline" onClick={() => setView("cancelled")} className="gap-2">
                <Ban className="size-4" aria-hidden />
                {cancelledCount > 0 ? `Cancelled (${cancelledCount})` : "Cancelled"}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setView("active")} className="gap-2">
                <ArrowLeft className="size-4" aria-hidden />
                Back to goals
              </Button>
            )}
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />
              New goal
            </Button>
          </div>
        }
      />

      {view === "active" ? (
        active.isLoading ? (
          <GoalCardsSkeleton />
        ) : active.isError ? (
          <ErrorState description="Couldn't load your goals." onRetry={() => active.refetch()} />
        ) : optimisticActive.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No active goals"
            description="Set a balance, income or expense target to start tracking progress."
            action={
              <Button onClick={openCreate} className="gap-2">
                <Plus className="size-4" />
                New goal
              </Button>
            }
          />
        ) : (
          <div className="space-y-10">
            {groupGoalsByStanding(optimisticActive).map(({ standing, goals }) => (
              <section key={standing} aria-labelledby={`goals-${standing}`}>
                <h2 id={`goals-${standing}`} className="mb-3 px-1 text-[13px] font-semibold text-muted-foreground">
                  {STANDING_LABEL[standing]} · {goals.length}
                </h2>
                <ul className="space-y-3">
                  {goals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      account={accountsById.get(goal.accountId)}
                      showAccount={showAccount}
                      onEdit={canPost(accountsById.get(goal.accountId)) ? openEdit : undefined}
                      onStop={canPost(accountsById.get(goal.accountId)) ? setToStop : undefined}
                      onViewHistory={setHistoryGoal}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : cancelled.isLoading ? (
        <GoalCardsSkeleton />
      ) : cancelled.isError ? (
        <ErrorState description="Couldn't load your cancelled goals." onRetry={() => cancelled.refetch()} />
      ) : cancelledCount === 0 ? (
        <EmptyState icon={Target} title="No cancelled goals" description="Goals you cancel will show up here, and can be restored." />
      ) : (
        <CancelledGoalsList
          goals={cancelled.data ?? []}
          accountsById={accountsById}
          showAccount={showAccount}
          onViewHistory={setHistoryGoal}
          onRestore={(g) => restoreMut.mutate(g.id)}
          busyId={(restoreMut.isPending && restoreMut.variables) || undefined}
        />
      )}

      <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} goal={editing} />

      <GoalHistoryDialog
        open={!!historyGoal}
        onOpenChange={(o) => !o && setHistoryGoal(undefined)}
        goal={historyGoal}
        account={historyGoal ? accountsById.get(historyGoal.accountId) : undefined}
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
    </>
  );
}
