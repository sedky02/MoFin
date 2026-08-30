"use client";

import { useMonthlySummary } from "@/hooks/useAnalytics";
import { MoneyAmount } from "@/components/common/money-amount";
import { colorAt } from "./donut";
import { CategoryIcon } from "@/components/dashboard/category-icon";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/common/states";
import { tryParse } from "@/lib/decimal";
import { PieChart } from "lucide-react";

export function MonthlySummaryCard({
  year,
  month,
  currency,
  accountId,
}: {
  year: number;
  month: number;
  currency: string;
  accountId?: string;
}) {
  const { data, isLoading, isError, refetch } = useMonthlySummary(year, month, accountId);

  if (isLoading) {
    return (
      <Card className="glass-panel border-0 p-5 ring-0">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="glass-panel border-0 p-5 ring-0">
        <ErrorState description="Couldn't load this month's summary." onRetry={() => refetch()} />
      </Card>
    );
  }

  const segments = data.categoryBreakdown
    .map((item, i) => ({
      label: item.category,
      value: tryParse(item.amount)?.toNumber() ?? 0,
      color: item.color || colorAt(i),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const hasData =
    segments.length > 0 ||
    !tryParse(data.income)?.isZero() ||
    !tryParse(data.expenses)?.isZero();

  const topCategories = segments.slice(0, 4);

  return (
    <Card className="glass-panel border-0 p-5 ring-0">
      <h2 className="label-caps text-foreground!">Monthly Summary</h2>

      {!hasData ? (
        <EmptyState
          icon={PieChart}
          title="Nothing recorded yet"
          description="Approve a draft or record a transaction to populate this month."
          className="mt-5"
        />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {topCategories.map((s) => (
            <div
              key={s.label}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card/40 p-4 text-center"
            >
              <div
                className="flex size-10 items-center justify-center rounded-full"
                style={{
                  backgroundColor: `color-mix(in oklab, ${s.color} 16%, transparent)`,
                  color: s.color,
                }}
              >
                <CategoryIcon name={s.label} className="size-5" />
              </div>
              <p className="truncate text-xs text-muted-foreground">{s.label}</p>
              <MoneyAmount
                amount={String(s.value)}
                currency={currency}
                compact
                className="text-base font-semibold text-foreground"
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
