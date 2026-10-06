"use client";

import * as React from "react";
import Link from "next/link";
import { Target, ArrowRight, Plus } from "lucide-react";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { useGoals } from "@/hooks/useGoals";
import { useAccounts } from "@/hooks/useAccounts";
import { GoalMiniCard } from "@/components/goals/goal-mini-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SkeletonCard, EmptyState, ErrorState } from "@/components/common/states";

/** Condensed goals section for the dashboard; full management lives on /goals. */
export function GoalsSummary({ accountId }: { accountId?: string } = {}) {
  const { data: goals, isLoading, isError, refetch } = useGoals();
  const { data: accounts } = useAccounts("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const accountsById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const visible = (goals ?? []).filter((g) => !accountId || g.accountId === accountId).slice(0, 4);

  return (
    <Card className="glass-panel h-full overflow-hidden border-0 p-0 ring-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <h2 className="label-caps text-foreground!">Goals</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7 rounded-full"
            aria-label="New goal"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="size-3.5" />
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
            <Link href="/goals">
              View all <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center p-4 pt-0">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState description="Couldn't load your goals." onRetry={() => refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Target}
            // Already inside a card: drop the nested dashed box and shrink the padding
            // so an empty Goals card isn't taller than the balance card beside it.
            className="border-0 bg-transparent px-2 py-5"
            title="No goals yet"
            description={
              accountId ? "This account has no goals yet." : "Set a target to start tracking progress."
            }
            action={
              accounts && accounts.length === 0 ? (
                <Button asChild>
                  <Link href="/accounts">Create an account first</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/goals">Create a goal</Link>
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 ">
            {visible.map((goal, i) => (
              <GoalMiniCard
                key={goal.id}
                goal={goal}
                account={accountsById.get(goal.accountId)}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}
