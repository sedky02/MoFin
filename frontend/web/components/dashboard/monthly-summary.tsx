"use client";

import * as React from "react";
import Link from "next/link";
import { colorAt, Donut } from "./donut";
import { useMonthlySummary } from "@/hooks/useAnalytics";
import { useAccounts } from "@/hooks/useAccounts";
import { useMainAccount } from "@/hooks/useMainAccount";
import { MoneyAmount } from "@/components/common/money-amount";
import { CategoryIcon } from "@/components/dashboard/category-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, EmptyState } from "@/components/common/states";
import { subtract, tryParse } from "@/lib/decimal";
import { summaryApiCurrency } from "@/lib/dashboard-scope";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, PieChart, RotateCcw } from "lucide-react";
import { CurrencyMenu } from "./currency-switch";

type Kind = "expense" | "income";

// Top categories shown before the rest are folded into "Other": keeps the legend at most
// five rows, which is what the fixed-height content slot below is sized for.
const MAX_SEGMENTS = 4;

/** Calendar month `offset` months before (year, month). */
function shiftMonth(year: number, month: number, offset: number) {
  const d = new Date(Date.UTC(year, month - 1 - offset, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function MonthlySummaryCard({
  year,
  month,
  currency,
  currencies = [],
  onCurrencyChange,
  accountId,
}: {
  /** The current month; the card can step back from it. */
  year: number;
  month: number;
  /** Currency shown for an all-accounts view (shared with the balance hero). */
  currency: string;
  /** Currencies held across all accounts; a switch is shown when there is more than one. */
  currencies?: string[];
  onCurrencyChange?: (currency: string) => void;
  /** The dashboard's active account (explicit pick, else main). `undefined` = all accounts. */
  accountId?: string;
}) {
  const { data: accounts = [] } = useAccounts();
  const { accountId: mainAccountId } = useMainAccount();
  const [kind, setKind] = React.useState<Kind>("expense");
  // Months back from the current one; 0 = this month (can't go into the future).
  const [offset, setOffset] = React.useState(0);
  const viewed = shiftMonth(year, month, offset);

  // Amounts can't be summed across currencies, so an all-accounts view is asked for one
  // currency. With a single currency the plain request is used (it matches the server prefetch).
  const apiCurrency = summaryApiCurrency(accountId, currencies, currency);
  const { data, isLoading, isError, refetch } = useMonthlySummary(viewed.year, viewed.month, accountId, apiCurrency);

  const scopedAccount = accounts.find((a) => a.id === accountId);
  const scopedCurrency = scopedAccount?.currency ?? currency;

  const monthLabel = new Date(Date.UTC(viewed.year, viewed.month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // One account control lives in the top bar; this card only says what it is showing.
  const scopeLabel = scopedAccount
    ? `${scopedAccount.name}${scopedAccount.id === mainAccountId ? " · Main account" : ""}`
    : "All accounts";

  const arrow =
    "inline-flex size-7 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 pointer-coarse:size-10";

  // The month stepper is the card's primary control, so it carries the month as a title.
  const monthNav = (
    <div className="flex h-8 items-center gap-0.5">
      <button type="button" className={arrow} onClick={() => setOffset((o) => o + 1)} aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-32 px-1 text-center text-base font-semibold tracking-[-0.01em]">
        {monthLabel}
      </span>
      {/* A disabled button swallows hover, so the reason lives on the wrapper. */}
      <span title={offset === 0 ? "You're viewing the current month" : undefined}>
        <button
          type="button"
          className={arrow}
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </button>
      </span>
      {/* Always in the layout (hidden on the current month) so the stepper never shifts. */}
      <button
        type="button"
        className={cn(arrow, offset === 0 && "invisible")}
        onClick={() => setOffset(0)}
        aria-label="Back to this month"
        title="Back to this month"
        tabIndex={offset === 0 ? -1 : 0}
      >
        <RotateCcw className="size-3.5" />
      </button>
    </div>
  );

  // "All accounts · TND ⌄": the currency reads as part of the subtitle, not another control.
  const currencyMenu =
    !accountId && onCurrencyChange ? (
      <CurrencyMenu
        currencies={currencies.map((code) => ({
          code,
          activity: code !== currency && (data?.activeCurrencies ?? []).includes(code),
        }))}
        value={currency}
        onChange={onCurrencyChange}
      />
    ) : null;

  // Row 1: what this is, and the Expenses/Income switch. Row 2: which month, and which account.
  const headerRow = (tabs?: React.ReactNode) => (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-sm flex h-8 items-center whitespace-nowrap text-foreground!">Monthly summary</h2>
        <div className="shrink-0">{tabs}</div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {monthNav}
        <div className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
          <span className="max-w-[11rem] shrink-0 truncate">{scopeLabel}</span>
          {currencyMenu && (
            <>
              <span aria-hidden>·</span>
              {currencyMenu}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const isExpense = kind === "expense";
  const raw = (data && (isExpense ? data.categoryBreakdown : data.incomeBreakdown)) ?? [];
  const total = (data && (isExpense ? data.expenses : data.income)) ?? "0";

  // Colours come from the chart ramp in rank order (biggest slice first), not from each
  // category's own colour: the ramp is built to stay distinguishable and on-palette.
  const sorted = raw
    .map((item) => ({
      label: item.category,
      amount: item.amount,
      value: tryParse(item.amount)?.toNumber() ?? 0,
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ ...s, color: colorAt(i) }));

  // Long tails make an unreadable ring: keep the biggest categories, fold the rest into "Other".
  const head = sorted.slice(0, MAX_SEGMENTS);
  const rest = sorted.slice(MAX_SEGMENTS);
  const restValue = rest.reduce((sum, s) => sum + s.value, 0);
  const segments =
    restValue > 0
      ? [...head, { label: "Other", amount: String(restValue), value: restValue, color: "var(--muted-foreground)" }]
      : head;

  const sum = sorted.reduce((acc, s) => acc + s.value, 0);
  const hasData = segments.length > 0;
  const noun = isExpense ? "spending" : "income";

  const net = data ? subtract(data.income, data.expenses) : "0";
  const incomeValue = tryParse(data?.income ?? "0")?.toNumber() ?? 0;
  const expensesValue = tryParse(data?.expenses ?? "0")?.toNumber() ?? 0;
  const netValue = tryParse(net)?.toNumber() ?? 0;
  const savedPct = Math.round((tryParse(data?.savingsRate ?? "0")?.toNumber() ?? 0) * 100);
  // Zero is not a result: only colour amounts that are.
  const tone = (value: number, nonZero: string) => (value === 0 ? "text-foreground" : nonZero);
  const isPastMonth = offset > 0;
  // Another currency with data this month (all-accounts view only): point the user at it.
  const otherActive = !accountId && onCurrencyChange ? (data?.activeCurrencies ?? []).filter((c) => c !== currency) : [];

  // Every state (loading, error, empty, data) fills the same two slots with fixed minimum
  // heights, so switching month, tab or currency never makes the card jump.
  let strip: React.ReactNode;
  let content: React.ReactNode;

  if (isLoading) {
    strip = <Skeleton className="mt-4 h-37 w-full rounded-xl" />;
    content = (
      <div className="flex w-full flex-col items-center gap-6 sm:flex-row">
        <Skeleton className="size-44 shrink-0 rounded-full" />
        <div className="w-full space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    );
  } else if (isError || !data) {
    strip = <div className="mt-4 h-37" aria-hidden />;
    content = (
      <ErrorState
        description="Couldn't load this month's summary."
        onRetry={() => refetch()}
        className="h-full w-full py-6"
      />
    );
  } else {
    strip = (
      <dl className="mt-4 flex h-37 flex-col justify-between rounded-xl bg-muted px-4 py-3">
        {/* Net is the answer to "how did this month go", so it leads. */}
        <div className="min-w-0">
          <dt className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
            Net
            {incomeValue > 0 && <span aria-hidden>·</span>}
            {/* A negative rate ("-800% saved") means nothing to a reader; say what happened instead. */}
            {incomeValue > 0 &&
              (savedPct >= 0 ? (
                <span className="tabular">{savedPct}% saved</span>
              ) : (
                <span className="text-destructive">Overspent</span>
              ))}
          </dt>
          <dd className="mt-0.5">
            <MoneyAmount
              amount={net}
              currency={scopedCurrency}
              className={cn(
                "text-3xl font-semibold leading-tight tracking-[-0.025em]",
                tone(netValue, netValue < 0 ? "text-destructive" : "text-success"),
              )}
            />
          </dd>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Income</dt>
            <dd className="mt-0.5">
              <MoneyAmount
                amount={data.income}
                currency={scopedCurrency}
                className={cn("text-sm font-semibold", tone(incomeValue, "text-success"))}
              />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Expenses</dt>
            <dd className="mt-0.5">
              <MoneyAmount
                amount={data.expenses}
                currency={scopedCurrency}
                className={cn("text-sm font-semibold", tone(expensesValue, "text-destructive"))}
              />
            </dd>
          </div>
        </div>
      </dl>
    );

    content = !hasData ? (
      <EmptyState
        icon={PieChart}
        title={`No ${noun} recorded`}
        description={
          otherActive.length > 0
            ? `Nothing in ${currency} for ${monthLabel}, but ${otherActive.join(" and ")} ${otherActive.length > 1 ? "have" : "has"} activity.`
            : isPastMonth
              ? `Nothing was recorded in ${monthLabel}.`
              : isExpense
                ? "Record an expense to populate this month."
                : "Record income to see where it comes from this month."
        }
        action={
          // The new-transaction form dates entries today, so only offer it for the current month.
          otherActive.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => onCurrencyChange?.(otherActive[0])}>
              Show {otherActive[0]}
            </Button>
          ) : isPastMonth ? (
            <Button size="sm" variant="secondary" onClick={() => setOffset(0)}>
              Back to this month
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/transactions/new">{isExpense ? "Record an expense" : "Record income"}</Link>
            </Button>
          )
        }
        className="h-full w-full py-6"
      />
    ) : (
      <div className="flex w-full flex-col items-center gap-6 sm:flex-row sm:items-center">
        <Donut
          segments={segments}
          size={176}
          thickness={20}
          ariaLabel={`${isExpense ? "Spending" : "Income"} by category`}
          center={
            <>
              <span className="text-xs text-muted-foreground">Total {noun}</span>
              {/* Full precision like the rows beside it; compact only when it would not fit the ring. */}
              <MoneyAmount
                amount={total}
                currency={scopedCurrency}
                compact={total.length > 9}
                className="mt-0.5 text-base font-semibold text-foreground"
              />
            </>
          }
        />
        <ul className="w-full min-w-0 flex-1 space-y-2">
          {segments.map((s) => {
            const share = sum > 0 ? Math.round((s.value / sum) * 100) : 0;
            return (
              <li key={s.label} className="flex items-center gap-3">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${s.color} 16%, transparent)`,
                    color: s.color,
                  }}
                >
                  <CategoryIcon name={s.label} className="size-4" />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{s.label}</p>
                <div className="shrink-0 text-right">
                  <MoneyAmount amount={s.amount} currency={scopedCurrency} className="text-sm font-semibold text-foreground" />
                  <p className="text-xs text-muted-foreground tabular">{share}%</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <Card className="@container flex flex-col p-5">
      {headerRow(
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)} className="shrink-0">
          <TabsList aria-label="Breakdown type">
            <TabsTrigger value="expense">Expenses</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        </Tabs>,
      )}
      {strip}
      {/* A fixed height from sm up (ring or a full five-row legend fits), so ring, empty and error
          states are all exactly the same size. Below sm the ring stacks above the legend. */}
      <div className="mt-1 flex min-h-54 items-center sm:h-54">{content}</div>
    </Card>
  );
}
