"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GoalStatusBadge } from "@/components/common/badges";
import { MoneyAmount } from "@/components/common/money-amount";
import { SkeletonRows, EmptyState, ErrorState } from "@/components/common/states";
import { formatPeriodDate } from "@/lib/format";
import { History } from "lucide-react";
import { useGoalHistory } from "@/hooks/useGoals";
import { goalProgressSourceLabel } from "@/lib/goal-scope";
import type { Account, Goal } from "@/lib/types";

export function GoalHistoryDialog({
  open,
  onOpenChange,
  goal,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal; // present → dialog is open for this goal
  account?: Account;
}) {
  const currency = account?.currency ?? "USD";
  const { data, isLoading, isError, refetch } = useGoalHistory(goal?.id ?? "", !!goal && open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{goal?.name} — history</DialogTitle>
          <DialogDescription>
            Newest first. Finished periods keep the result recorded when they ended; editing an old
            transaction only changes the current period.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : isError ? (
          <ErrorState description="Couldn't load this goal's history." onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={History} title="No periods yet" description="This goal hasn't tracked a period yet." />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((instance) => (
                  <TableRow key={instance.id} data-testid="goal-history-row">
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatPeriodDate(instance.periodStart)} – {formatPeriodDate(instance.periodEnd)}
                      <span className="block text-xs text-muted-foreground" data-testid="goal-history-source">
                        {goalProgressSourceLabel(instance.progressSource)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <MoneyAmount amount={instance.progressAmount} currency={currency} />
                      <span className="text-muted-foreground"> / </span>
                      <MoneyAmount amount={instance.targetAmount} currency={currency} className="text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <GoalStatusBadge status={instance.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
