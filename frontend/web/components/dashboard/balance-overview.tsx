"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDailySeries } from "@/hooks/useAnalytics";
import { HideableAmount } from "@/components/common/hideable-amount";
import { MoneyAmount } from "@/components/common/money-amount";
import { useRevealedAmount } from "@/hooks/use-revealed-amount";
import { isAmountHidden } from "@/lib/account-privacy";
import { CurrencySwitch } from "@/components/dashboard/currency-switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tryParse } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import {
  addDaysIso,
  dayLong,
  dayShort,
  deviceTimeZone,
  localIso,
  mondayOf,
  scaleY,
  weekHeadline,
  weekRange,
  weekScale,
  weekTitle,
} from "@/lib/week";
import { cn } from "@/lib/utils";
import type { Account, DailySeriesPoint } from "@/lib/types";

type Metric = "expenses" | "income" | "balance";
const TABS: { value: Metric; label: string }[] = [
  { value: "expenses", label: "Expenses" },
  { value: "income", label: "Income" },
  { value: "balance", label: "Balance" },
];

const arrow =
  "inline-flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-card hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-muted-foreground/40 pointer-coarse:size-11";

const dayText = (p: DailySeriesPoint, currency: string) =>
  `${dayLong(p.date)}: income ${formatMoney(p.income, currency)}, expenses ${formatMoney(p.expenses, currency)}, balance ${formatMoney(p.balance, currency)}`;

/** Hover, focus or click a bar for its exact amount. Days are counted in the viewer's time zone. */
export function BalanceOverview({
  amount,
  currency,
  caption,
  overdrawn,
  accountId,
  account,
  currencies = [],
  onCurrencyChange,
  emptyAction,
  emptyPanel,
}: {
  amount: string;
  currency: string;
  caption: string;
  overdrawn: boolean;
  accountId?: string;
  account?: Account;
  currencies?: { code: string; overdrawn: boolean }[];
  onCurrencyChange?: (currency: string) => void;
  emptyAction?: React.ReactNode;
  /** Nothing is recorded at all: replaces the chart and its metric tabs (and `emptyAction`). */
  emptyPanel?: React.ReactNode;
}) {
  const [metric, setMetric] = React.useState<Metric>("balance");
  // A hidden account shows dots, and no chart or change, until the user reveals it.
  const [revealed] = useRevealedAmount(account?.id);
  const masked = isAmountHidden(account) && !revealed;
  // Client-only: the viewer's today and time zone (the server can't know them).
  const [today] = React.useState(() => localIso(new Date()));
  const [timeZone] = React.useState(deviceTimeZone);
  const thisMonday = mondayOf(today);
  const [monday, setMonday] = React.useState(thisMonday);
  const [picked, setPicked] = React.useState<string | null>(null);
  // Two weeks: the one shown and the one before it, for the "vs the week before" chip.
  const from = addDaysIso(monday, -7);
  const series = useDailySeries(currency, from, 14, timeZone, accountId);
  const data = series.data;
  const isLoading = series.isLoading;
  const isError = series.isError;
  const refetch = () => void series.refetch();
  const all = data ? data.points : [];
  const ready = all[7]?.date === monday;
  const week = all.slice(7);
  const atCurrent = monday === thisMonday;

  const headline = weekHeadline(metric, ready ? all : [], monday, today, { amount, caption });

  const values = week.map((p) => (p.date > today ? 0 : (tryParse(p[metric])?.toNumber() ?? 0)));
  const scale = weekScale(values);
  const zero = scaleY(0, scale) * 100;
  const chartId = React.useId();

  function goTo(next: string) {
    setMonday(next);
    setPicked(null);
  }

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
        {!emptyPanel && !masked && (
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList aria-label="Chart metric">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-3">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      <div className="mt-6">
        <HideableAmount
          account={account}
          currency={currency}
          className="block text-5xl font-light leading-none tracking-[-0.035em] text-foreground sm:text-7xl"
        >
          {!ready && (metric !== "balance" || !atCurrent) ? (
            <Skeleton className="h-12 w-64 rounded-xl sm:h-[4.5rem]" />
          ) : (
            <MoneyAmount
              key={`${metric}-${monday}`}
              amount={headline.amount}
              currency={currency}
              animate
              className="block text-5xl font-light leading-none tracking-[-0.035em] text-foreground sm:text-7xl"
            />
          )}
        </HideableAmount>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {headline.caption}
        {metric === "balance" && overdrawn && <span className="font-medium text-destructive"> · Overdrawn</span>}
      </p>
      {emptyAction && !emptyPanel && <div className="mt-5">{emptyAction}</div>}
      {headline.chip && !masked && (
        <span
          className={cn(
            "mt-3 inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
            headline.chip.tone === "bad" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
          )}
        >
          {headline.chip.prefix && <span>{headline.chip.prefix}</span>}
          <MoneyAmount amount={headline.chip.delta} currency={currency} signed />
          <span>{headline.chip.suffix}</span>
        </span>
      )}

      {emptyPanel ? (
        <div className="mt-8 border-t border-border pt-6">{emptyPanel}</div>
      ) : masked ? (
        <p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
          This account&apos;s amounts are hidden. Use the eye button to show them.
        </p>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
            <p aria-live="polite" className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-[-0.01em]">{weekTitle(monday, today)}</span>
              {weekTitle(monday, today) !== weekRange(monday) && (
                <span className="text-sm text-muted-foreground tabular">{weekRange(monday)}</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {!atCurrent && (
                <button
                  type="button"
                  onClick={() => goTo(thisMonday)}
                  className="h-8 rounded-full px-3 text-xs font-medium text-primary-text transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11"
                >
                  This week
                </button>
              )}
              <div role="group" aria-label="Change week" className="flex items-center gap-0.5 rounded-full bg-secondary p-0.5">
                <button type="button" className={arrow} onClick={() => goTo(addDaysIso(monday, -7))} aria-label="Previous week">
                  <ChevronLeft className="size-4" />
                </button>
                {/* A disabled button swallows hover, so the reason lives on the wrapper. */}
                <span title={atCurrent ? "You're viewing the current week" : undefined}>
                  <button
                    type="button"
                    className={arrow}
                    onClick={() => goTo(addDaysIso(monday, 7))}
                    disabled={atCurrent}
                    aria-label="Next week"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </span>
              </div>
            </div>
          </div>

          {isError ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Couldn&apos;t load this week.{" "}
              <button type="button" className="font-medium text-foreground underline" onClick={() => refetch()}>
                Try again
              </button>
            </p>
          ) : isLoading && !data ? (
            <Skeleton className="mt-6 flex-1 min-h-40 rounded-xl" />
          ) : (
            <div className={cn("mt-5 flex flex-1 flex-col transition-opacity", !ready && "opacity-50")} style={{ minHeight: 190 }}>
              <div className="flex flex-1 gap-3">
                <div className="relative flex-1">
                  {scale.ticks.map((t) => (
                    <div
                      key={t}
                      aria-hidden
                      className={cn("absolute inset-x-0 border-t", t === 0 ? "border-border" : "border-dashed border-border/60")}
                      style={{ top: `${scaleY(t, scale) * 100}%` }}
                    />
                  ))}
                  <div className="absolute inset-0 flex gap-2 sm:gap-3">
                    {week.map((p, i) => {
                      const v = values[i];
                      const future = p.date > today;
                      const top = scaleY(Math.max(v, 0), scale) * 100;
                      const bottom = 100 - scaleY(Math.min(v, 0), scale) * 100;
                      const isToday = p.date === today;
                      const open = picked === p.date;
                      return (
                        <div key={p.date} className="group relative flex-1">
                          {!future && (
                            <button
                              type="button"
                              aria-label={dayText(p, currency)}
                              aria-describedby={`${chartId}-v-${i}`}
                              aria-pressed={open}
                              onClick={() => setPicked(open ? null : p.date)}
                              className="absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span
                                className={cn(
                                  "absolute inset-x-[12%] transition-[top,bottom,filter] duration-300 group-hover:brightness-110",
                                  v < 0 ? "rounded-b-md" : "rounded-t-md",
                                  // Today carries the colour (red for spending or below zero); the rest is a
                                  // neutral that still clears 3:1 against the card.
                                  isToday || open ? (v < 0 || metric === "expenses" ? "bg-destructive" : "bg-primary") : "bg-bar",
                                  v === 0 && "opacity-40",
                                )}
                                style={{ top: `${top}%`, bottom: `${v === 0 ? 100 - zero - 1 : bottom}%` }}
                              />
                              <span
                                id={`${chartId}-v-${i}`}
                                className={cn(
                                  "pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-popover px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-surface transition-opacity",
                                  open ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                                )}
                                style={
                                  v < 0
                                    ? { top: `calc(${100 - bottom}% + 4px)` }
                                    : { bottom: `calc(${100 - top}% + 4px)` }
                                }
                              >
                                <MoneyAmount amount={p[metric]} currency={currency} />
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div aria-hidden className="relative w-20 shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular">
                  {scale.ticks.map((t) => (
                    <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${scaleY(t, scale) * 100}%` }}>
                      <MoneyAmount amount={String(t)} currency={currency} compact />
                    </span>
                  ))}
                </div>
              </div>
              <div aria-hidden className="mt-2 flex gap-2 pr-[92px] sm:gap-3">
                {week.map((p) => (
                  <span
                    key={p.date}
                    className={cn(
                      "flex-1 text-center text-xs",
                      p.date === today ? "font-semibold text-primary-text" : p.date > today ? "text-muted-foreground/50" : "text-muted-foreground",
                    )}
                  >
                    {dayShort(p.date)}
                  </span>
                ))}
              </div>
              <table className="sr-only">
                <caption>{weekRange(monday)}</caption>
                <thead>
                  <tr>
                    {["Day", "Income", "Expenses", "Balance"].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {week
                    .filter((p) => p.date <= today)
                    .map((p) => (
                      <tr key={p.date}>
                        <th scope="row">{dayLong(p.date)}</th>
                        <td>{formatMoney(p.income, currency)}</td>
                        <td>{formatMoney(p.expenses, currency)}</td>
                        <td>{formatMoney(p.balance, currency)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
