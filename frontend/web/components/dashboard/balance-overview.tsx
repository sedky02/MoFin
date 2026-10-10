"use client";

import * as React from "react";
import { useMonthlySeries } from "@/hooks/useAnalytics";
import { MoneyAmount } from "@/components/common/money-amount";
import { CurrencySwitch } from "@/components/dashboard/currency-switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/format";
import { tryParse } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import type { MonthlySeriesPoint } from "@/lib/types";

type Metric = "expenses" | "income" | "balance";
const TABS: { value: Metric; label: string }[] = [
  { value: "expenses", label: "Expenses" },
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
    <div className="relative flex h-full flex-1 flex-col overflow-hidden rounded-hero bg-card p-6 shadow-hero sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {currencies.length > 1 && onCurrencyChange ? (
            <CurrencySwitch currencies={currencies} value={currency} onChange={onCurrencyChange} />
          ) : (
            <span className="label-sm text-primary-text!">{currency} balance</span>
          )}
        </div>
        {/* The shared Tabs control: one tab stop, arrow keys move between metrics. */}
        <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <TabsList aria-label="Chart metric">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <MoneyAmount
        amount={amount}
        currency={currency}
        animate
        className="mt-6 block text-5xl font-light leading-none tracking-[-0.035em] text-foreground sm:text-7xl"
      />
      <p className="mt-4 text-sm text-muted-foreground">
        {caption}
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
                      <span className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary-text group-hover:opacity-0">
                        Now
                      </span>
                    )}
                    <div
                      className={cn(
                        "w-full rounded-t-md transition-[height,filter] duration-300 group-hover:brightness-110 group-focus-within:brightness-110",
                        // The current month carries the colour (red for spending or a negative balance, the
                        // accent otherwise); history is a neutral that still clears 3:1 against the card.
                        isNow ? (v < 0 || metric === "expenses" ? "bg-destructive" : "bg-primary") : "bg-bar",
                      )}
                      style={{ height: `${pct}%` }}
                    />
                    {/* Hover / keyboard-focus details for this month */}
                    <div
                      role="tooltip"
                      className={cn(
                        "pointer-events-none invisible absolute bottom-full z-20 mb-2 w-52 origin-bottom scale-95 rounded-xl bg-popover p-3 text-xs opacity-0 shadow-surface transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:scale-100 group-focus-within:opacity-100",
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
                  <span className={cn("text-xs", isNow ? "font-semibold text-primary-text" : "text-muted-foreground")}>
                    {short(p.month)}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            aria-hidden
            className="flex flex-col justify-between border-l border-dashed border-border pb-5 pl-3 text-xs text-muted-foreground tabular"
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
