"use client";

import * as React from "react";
import { colorAt, Donut } from "./donut";
import { useMonthlySummary } from "@/hooks/useAnalytics";
import { useAccounts } from "@/hooks/useAccounts";
import { useMainAccount } from "@/hooks/useMainAccount";
import { MoneyAmount } from "@/components/common/money-amount";
import { CategoryIcon } from "@/components/dashboard/category-icon";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, EmptyState } from "@/components/common/states";
import { subtract, tryParse } from "@/lib/decimal";
import { PieChart } from "lucide-react";

type Kind = "expense" | "income";

const MAX_SEGMENTS = 5;

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
  /** The dashboard's active account (explicit pick, else main). `undefined` = all accounts. */
  accountId?: string;
  /** All-accounts view across more than one currency: totals can't be summed. */
  mixedCurrencies?: boolean;
}) {
  const { data: accounts = [] } = useAccounts();
  const { accountId: mainAccountId } = useMainAccount();
  const [kind, setKind] = React.useState<Kind>("expense");
  const { data, isLoading, isError, refetch } = useMonthlySummary(year, month, accountId);

  const scopedAccount = accounts.find((a) => a.id === accountId);
  const scopedCurrency = scopedAccount?.currency ?? currency;

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // One account control lives in the top bar; this card only says what it is showing.
  const scopeLabel = scopedAccount
    ? `${scopedAccount.name}${scopedAccount.id === mainAccountId ? " · Main account" : ""}`
    : "All accounts";

  const title = (
    <div className="min-w-0">
      <h2 className="label-caps text-foreground!">Monthly Summary · {monthLabel}</h2>
      <p className="mt-1 truncate text-xs text-muted-foreground">{scopeLabel}</p>
    </div>
  );

  // The backend sums amounts without regard to currency when no account is
  // selected, so showing that total under one currency symbol would be wrong.
  if (mixedCurrencies && !accountId) {
    return (
      <Card className="glass-panel border-0 p-5 ring-0">
        {title}
        <EmptyState
          icon={PieChart}
          title="Select an account"
          description="Your accounts use different currencies, so this summary is shown one account at a time. Pick one from the account menu at the top."
          className="mt-5"
        />
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="glass-panel border-0 p-5 ring-0">
        {title}
        <Skeleton className="mt-5 h-18 w-full rounded-2xl" />
        <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
          <Skeleton className="size-44 shrink-0 rounded-full" />
          <div className="w-full space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
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

  const isExpense = kind === "expense";
  const raw = (isExpense ? data.categoryBreakdown : data.incomeBreakdown) ?? [];
  const total = isExpense ? data.expenses : data.income;

  const sorted = raw
    .map((item, i) => ({
      label: item.category,
      amount: item.amount,
      value: tryParse(item.amount)?.toNumber() ?? 0,
      color: item.color || colorAt(i),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

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

  const net = subtract(data.income, data.expenses);
  const hasIncome = (tryParse(data.income)?.toNumber() ?? 0) > 0;
  const savedPct = Math.round((tryParse(data.savingsRate)?.toNumber() ?? 0) * 100);

  return (
    <Card className="glass-panel border-0 p-5 ring-0">
      <div className="flex items-start justify-between gap-3">
        {title}
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)} className="shrink-0">
          <TabsList aria-label="Breakdown type">
            <TabsTrigger value="expense">Expenses</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Always visible, whichever breakdown is selected. */}
      <dl className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-muted/50 p-4">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Income</dt>
          <dd className="mt-1">
            <MoneyAmount amount={data.income} currency={scopedCurrency} className="text-sm font-semibold text-success" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Expenses</dt>
          <dd className="mt-1">
            <MoneyAmount amount={data.expenses} currency={scopedCurrency} className="text-sm font-semibold text-destructive" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Net</dt>
          <dd className="mt-1">
            <MoneyAmount amount={net} currency={scopedCurrency} colorBySign className="text-sm font-semibold" />
            {hasIncome && <p className="mt-0.5 text-xs text-muted-foreground tabular">{savedPct}% saved</p>}
          </dd>
        </div>
      </dl>

      {!hasData ? (
        <EmptyState
          icon={PieChart}
          title={`No ${noun} recorded`}
          description={
            isExpense
              ? "Approve a draft or record an expense to populate this month."
              : "Record income to see where it comes from this month."
          }
          className="mt-5"
        />
      ) : (
        <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
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
          <ul className="w-full min-w-0 flex-1 space-y-3">
            {segments.map((s) => {
              const share = sum > 0 ? Math.round((s.value / sum) * 100) : 0;
              return (
                <li key={s.label} className="flex items-center gap-3">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-full"
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
      )}
    </Card>
  );
}
