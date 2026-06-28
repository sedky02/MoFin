"use client";

import { useMonthlySummary } from "@/hooks/useAnalytics";
import { MoneyAmount } from "@/components/common/money-amount";
import { Donut, Legend, colorAt } from "./donut";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/common/states";
import { formatMoney, percent } from "@/lib/format";
import { tryParse } from "@/lib/decimal";
import { PieChart } from "lucide-react";

export function MonthlySummaryCard({
  year,
  month,
  currency,
}: {
  year: number;
  month: number;
  currency: string;
}) {
  const { data, isLoading, isError, refetch } = useMonthlySummary(year, month);

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));

  if (isLoading) {
    return (
      <Card className="glass-panel border-0 p-5 ring-0">
        <Skeleton className="h-4 w-32" />
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
          <Skeleton className="size-[168px] rounded-full" />
          <div className="flex-1 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
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
      color: colorAt(i),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const hasData =
    segments.length > 0 ||
    !tryParse(data.income)?.isZero() ||
    !tryParse(data.expenses)?.isZero();

  return (
    <Card className="glass-panel border-0 p-5 ring-0">
      <div className="flex items-center justify-between">
        <h2 className="label-caps text-foreground!">{monthLabel}</h2>
        <span className="rounded-md bg-accent/60 px-2 py-0.5 text-xs font-medium text-accent-foreground tabular">
          {percent(data.savingsRate)} saved
        </span>
      </div>

      {/* Income / expenses */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-secondary/60 p-3">
          <p className="text-xs text-muted-foreground">Income</p>
          <MoneyAmount
            amount={data.income}
            currency={currency}
            className="mt-1 block text-lg font-semibold text-success"
          />
        </div>
        <div className="rounded-lg bg-secondary/60 p-3">
          <p className="text-xs text-muted-foreground">Expenses</p>
          <MoneyAmount
            amount={data.expenses}
            currency={currency}
            className="mt-1 block text-lg font-semibold text-destructive"
          />
        </div>
      </div>

      {!hasData ? (
        <EmptyState
          icon={PieChart}
          title="Nothing recorded yet"
          description="Approve a draft or record a transaction to populate this month."
          className="mt-5"
        />
      ) : (
        <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <Donut
            segments={segments}
            center={
              <>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Spent
                </span>
                <MoneyAmount
                  amount={data.expenses}
                  currency={currency}
                  compact
                  className="text-base font-semibold"
                />
              </>
            }
          />
          <Legend
            className="flex-1"
            items={
              segments.length
                ? segments.slice(0, 6).map((s) => ({
                    label: s.label,
                    color: s.color,
                    value: formatMoney(String(s.value), currency, { compact: true }),
                  }))
                : [{ label: "No category spending", color: "var(--muted)", value: "" }]
            }
          />
        </div>
      )}
    </Card>
  );
}
