"use client";

import * as React from "react";
import { Plus, Target } from "lucide-react";
import { useGoals, useArchiveGoal } from "@/hooks/useGoals";
import { useAccounts } from "@/hooks/useAccounts";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { GoalHistoryDialog } from "@/components/goals/goal-history-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonCard, EmptyState, ErrorState } from "@/components/common/states";
import type { Goal } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function GoalsPage() {
  const [tab, setTab] = React.useState<"active" | "disabled">("active");

  const active = useGoals("active");
  const disabled = useGoals("archived", tab === "disabled");
  const { data: accounts } = useAccounts();
  const stopMut = useArchiveGoal();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Goal | undefined>();
  const [toStop, setToStop] = React.useState<Goal | undefined>();
  const [historyGoal, setHistoryGoal] = React.useState<Goal | undefined>();

  // Instant list removal on stop (React 19 useOptimistic).
  const [optimisticActive, removeOptimistic] = React.useOptimistic(
    active.data ?? [],
    (state: Goal[], id: string) => state.filter((g) => g.id !== id),
  );

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
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" />
            New goal
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "disabled")}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="disabled">Disabled</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          {active.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {optimisticActive.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  account={accountsById.get(goal.accountId)}
                  onEdit={openEdit}
                  onStop={setToStop}
                  onViewHistory={setHistoryGoal}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="disabled" className="mt-6">
          {disabled.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : disabled.isError ? (
            <ErrorState description="Couldn't load your disabled goals." onRetry={() => disabled.refetch()} />
          ) : !disabled.data || disabled.data.length === 0 ? (
            <EmptyState icon={Target} title="No disabled goals" description="Stopped goals will show up here." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {disabled.data.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  account={accountsById.get(goal.accountId)}
                  onViewHistory={setHistoryGoal}
                  readOnly
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} goal={editing} />

      <GoalHistoryDialog
        open={!!historyGoal}
        onOpenChange={(o) => !o && setHistoryGoal(undefined)}
        goal={historyGoal}
        account={historyGoal ? accountsById.get(historyGoal.accountId) : undefined}
      />

      <AlertDialog open={!!toStop} onOpenChange={(o) => !o && setToStop(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop “{toStop?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops tracking progress and moves it to Disabled. Its period history is preserved.
              You can&apos;t undo this from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStop}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
