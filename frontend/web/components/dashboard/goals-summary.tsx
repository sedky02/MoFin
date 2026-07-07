"use client";

import Link from "next/link";
import { Target, ArrowRight } from "lucide-react";
import { useGoals } from "@/hooks/useGoals";
import { useAccounts } from "@/hooks/useAccounts";
import { GoalMiniCard } from "@/components/goals/goal-mini-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SkeletonCard, EmptyState, ErrorState } from "@/components/common/states";

/** Condensed goals section for the dashboard; full management lives on /goals. */
export function GoalsSummary({ accountId }: { accountId?: string } = {}) {
  const { data: goals, isLoading, isError, refetch } = useGoals();
  const { data: accounts } = useAccounts();
  const accountsById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const visible = (goals ?? []).filter((g) => !accountId || g.accountId === accountId).slice(0, 4);

  return (
    <Card className="glass-panel overflow-hidden border-0 p-0 ring-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <h2 className="label-caps text-foreground!">Goals</h2>
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <Link href="/goals">
            View all <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="p-4 pt-0">
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
            title="No goals yet"
            description={
              accountId ? "This account has no goals yet." : "Set a target to start tracking progress."
            }
            action={
              <Button asChild>
                <Link href="/goals">Create a goal</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 ">
            {visible.map((goal) => (
              <GoalMiniCard key={goal.id} goal={goal} account={accountsById.get(goal.accountId)} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
