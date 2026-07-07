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
import { formatDate } from "@/lib/format";
import { History } from "lucide-react";
import { useGoalHistory } from "@/hooks/useGoals";
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
          <DialogDescription>Every past period this goal has tracked, oldest last.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : isError ? (
          <ErrorState description="Couldn't load this goal's history." onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={History} title="No periods yet" description="This goal hasn't completed a period." />
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
                  <TableRow key={instance.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(instance.periodStart)} – {formatDate(instance.periodEnd)}
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
