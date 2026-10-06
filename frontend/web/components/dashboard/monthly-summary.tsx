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
  mixedCurrencies = false,
}: {
  year: number;
  month: number;
  currency: string;
  accountId?: string;
  /** All-accounts view across more than one currency: totals can't be summed. */
  mixedCurrencies?: boolean;
}) {
  const { data, isLoading, isError, refetch } = useMonthlySummary(year, month, accountId);

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // The backend sums amounts without regard to currency when no account is
  // selected, so showing that total under one currency symbol would be wrong.
  if (mixedCurrencies && !accountId) {
    return (
      <Card className="glass-panel border-0 p-5 ring-0">
        <h2 className="label-caps text-foreground!">Monthly Summary · {monthLabel}</h2>
        <EmptyState
          icon={PieChart}
          title="Select an account"
          description="Your accounts use different currencies, so this summary is shown one account at a time."
          className="mt-5"
        />
      </Card>
    );
  }

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
      amount: item.amount,
      value: tryParse(item.amount)?.toNumber() ?? 0,
      color: item.color || colorAt(i),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  // The grid below only lists spending, so "has data" means has expenses.
  const hasData = segments.length > 0;

  const topCategories = segments.slice(0, 5);
  const totalSpending = segments.reduce((sum, seg) => sum + seg.value, 0);

  return (
    <Card className="glass-panel border-0 p-5 ring-0">
      <h2 className="label-caps text-foreground!">Monthly Summary · {monthLabel}</h2>

      {!hasData ? (
        <EmptyState
          icon={PieChart}
          title="No spending recorded"
          description="Approve a draft or record an expense to populate this month."
          className="mt-5"
        />
      ) : (
        <>
          <p className="mt-4 text-xs text-muted-foreground">Top spending</p>
          <ul className="mt-3 space-y-4">
            {topCategories.map((s) => {
              const share = totalSpending > 0 ? Math.round((s.value / totalSpending) * 100) : 0;
              return (
                <li key={s.label} className="flex items-center gap-3">
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${s.color} 16%, transparent)`,
                      color: s.color,
                    }}
                  >
                    <CategoryIcon name={s.label} className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium">{s.label}</p>
                      <MoneyAmount
                        amount={s.amount}
                        currency={currency}
                        className="shrink-0 text-sm font-semibold text-foreground"
                      />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div
                        role="progressbar"
                        aria-label={`${s.label} share of spending`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={share}
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
                      >
                        <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: s.color }} />
                      </div>
                      <span className="w-9 text-right text-[11px] text-muted-foreground tabular">{share}%</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
