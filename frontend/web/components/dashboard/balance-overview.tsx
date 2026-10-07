"use client";

import * as React from "react";
import { useMonthlySeries } from "@/hooks/useAnalytics";
import { MoneyAmount } from "@/components/common/money-amount";
import { CurrencySwitch } from "@/components/dashboard/currency-switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { tryParse } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import type { MonthlySeriesPoint } from "@/lib/types";

type Metric = "expenses" | "income" | "balance";
const TABS: { value: Metric; label: string }[] = [
  { value: "expenses", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "balance", label: "Balance" },
];

const short = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
const long = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The dashboard hero as one component: headline balance, month-over-month
 * change, and a six-month chart whose metric filter sits top-right. Each bar is
 * hoverable/focusable and shows that month's income, expenses and closing balance.
 */
export function BalanceOverview({
  amount,
  currency,
  caption,
  overdrawn,
  accountId,
  currencies = [],
  onCurrencyChange,
}: {
  amount: string;
  currency: string;
  caption: string;
  overdrawn: boolean;
  accountId?: string;
  /** Every currency the user holds; a switch is shown when there is more than one. */
  currencies?: { code: string; overdrawn: boolean }[];
  onCurrencyChange?: (currency: string) => void;
}) {
  const [metric, setMetric] = React.useState<Metric>("balance");
  const { data, isLoading } = useMonthlySeries(currency, accountId);
  const points = data?.points ?? [];

  const change = (() => {
    if (points.length < 2) return null;
    const a = tryParse(points[points.length - 1].balance);
    const b = tryParse(points[points.length - 2].balance);
    return a && b && !a.minus(b).isZero() ? a.minus(b) : null;
  })();

  const values = points.map((p) => tryParse(p[metric])?.toNumber() ?? 0);
  const max = Math.max(...values.map(Math.abs), 0);
  const last = points.length - 1;

  return (
    <div className="glass-panel pulse-ring relative flex h-full flex-1 flex-col overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
          {currencies.length > 1 && onCurrencyChange ? (
            <CurrencySwitch currencies={currencies} value={currency} onChange={onCurrencyChange} />
          ) : (
            <span className="label-caps tracking-widest! text-primary-text!">{currency} balance</span>
          )}
        </div>
        <div role="radiogroup" aria-label="Chart metric" className="inline-flex rounded-full border border-border p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={metric === t.value}
              onClick={() => setMetric(t.value)}
              className={cn(
                "rounded-full px-3.5 py-1 text-xs font-medium transition-colors",
                metric === t.value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <MoneyAmount
        amount={amount}
        currency={currency}
        animate
        className="terminal-glow mt-4 block font-heading text-5xl font-extrabold tracking-tighter text-foreground sm:text-7xl"
      />
      <p className="mt-3 text-sm text-muted-foreground">
        {caption} · balances always exact
        {overdrawn && <span className="font-medium text-destructive"> · Overdrawn</span>}
      </p>
      {change && (
        <span
          className={cn(
            "mt-3 inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
            change.isNegative() ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
          )}
        >
          <MoneyAmount amount={change.toString()} currency={currency} signed />
          <span>this month</span>
        </span>
      )}

      {isLoading ? (
        <Skeleton className="mt-6 flex-1 min-h-40 rounded-xl" />
      ) : points.length > 0 ? (
        <div className="mt-8 flex flex-1 gap-3" style={{ minHeight: 170 }}>
          <div className="flex flex-1 items-end gap-2 sm:gap-3">
            {points.map((p: MonthlySeriesPoint, i) => {
              const v = values[i];
              const pct = max > 0 ? Math.max((Math.abs(v) / max) * 100, v === 0 ? 0 : 3) : 0;
              const isNow = i === last;
              const align = i === 0 ? "left-0" : isNow ? "right-0" : "left-1/2 -translate-x-1/2";
              return (
                <div key={p.month} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div
                    tabIndex={0}
                    aria-label={`${long(p.month)}: income ${formatMoney(p.income, currency)}, expenses ${formatMoney(p.expenses, currency)}, balance ${formatMoney(p.balance, currency)}`}
                    className="relative flex w-full flex-1 items-end rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isNow && (
                      <span className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary-text group-hover:opacity-0">
                        Now
                      </span>
                    )}
                    <div
                      className={cn(
                        "w-full rounded-t-md transition-all group-hover:brightness-125 group-focus-within:brightness-125",
                        // Spending (and a negative balance) is red; the current month is the stronger shade.
                        v < 0 || metric === "expenses"
                          ? isNow ? "bg-destructive" : "bg-destructive/50"
                          : isNow ? "bg-primary" : "bg-primary/30",
                      )}
                      style={{ height: `${pct}%` }}
                    />
                    {/* Hover / keyboard-focus details for this month */}
                    <div
                      role="tooltip"
                      className={cn(
                        "pointer-events-none absolute bottom-full z-20 mb-2 hidden w-52 rounded-xl border border-border bg-popover p-3 text-xs shadow-lg group-hover:block group-focus-within:block",
                        align,
                      )}
                    >
                      <p className="mb-2 font-semibold text-foreground">{long(p.month)}</p>
                      {(
                        [
                          ["Income", p.income, "text-success"],
                          ["Expenses", p.expenses, "text-destructive"],
                          ["Balance", p.balance, "text-foreground"],
                        ] as const
                      ).map(([label, value, tone]) => (
                        <div key={label} className="flex items-center justify-between gap-3 py-0.5">
                          <span className="text-muted-foreground">{label}</span>
                          <MoneyAmount amount={value} currency={currency} className={cn("font-medium", tone)} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <span className={cn("text-[11px]", isNow ? "font-semibold text-primary-text" : "text-muted-foreground")}>
                    {short(p.month)}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            aria-hidden
            className="flex flex-col justify-between border-l border-dashed border-border pb-5 pl-3 text-[11px] text-muted-foreground tabular"
          >
            {[max, max / 2, 0].map((n, i) => (
              <MoneyAmount key={i} amount={String(n)} currency={currency} compact />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
