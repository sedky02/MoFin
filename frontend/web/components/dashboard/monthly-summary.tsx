"use client";

import { useMonthlySummary } from "@/hooks/useAnalytics";
import { MoneyAmount } from "@/components/common/money-amount";
import * as React from "react";
import Link from "next/link";
import { colorAt, Donut } from "./donut";
import { AccountSwitcher } from "./account-switcher";
import { useAccounts } from "@/hooks/useAccounts";
import { useMainAccount } from "@/hooks/useMainAccount";
import { CategoryIcon } from "@/components/dashboard/category-icon";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/common/states";
import { tryParse } from "@/lib/decimal";
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
  accountId?: string;
  /** All-accounts view across more than one currency: totals can't be summed. */
  mixedCurrencies?: boolean;
}) {
  const { data: accounts = [] } = useAccounts();
  const { accountId: mainAccountId } = useMainAccount();
  const [kind, setKind] = React.useState<Kind>("expense");
  // `undefined` = follow the default; "all" = the user explicitly chose every account here.
  const [override, setOverride] = React.useState<string | undefined>();

  // Default scope: an account picked in the top bar, else the main account, else all accounts.
  const scopedId = override === "all" ? undefined : (override ?? accountId ?? mainAccountId);
  const scopedAccount = accounts.find((a) => a.id === scopedId);
  const scopedCurrency = scopedAccount?.currency ?? currency;
  const { data, isLoading, isError, refetch } = useMonthlySummary(year, month, scopedId);

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const header = (
    <div className="space-y-2">
      <h2 className="label-caps text-foreground!">Monthly Summary · {monthLabel}</h2>
      {accounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <AccountSwitcher
            accounts={accounts}
            value={scopedId}
            onChange={(id) => setOverride(id ?? "all")}
            label="Account for this summary"
            className="h-8 w-48"
          />
          <p className="text-xs text-muted-foreground">
            {scopedId && scopedId === mainAccountId ? (
              "Your main account"
            ) : !mainAccountId ? (
              <>
                <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
                  Set a main account
                </Link>{" "}
                to open here by default
              </>
            ) : null}
          </p>
        </div>
      )}
    </div>
  );

  // The backend sums amounts without regard to currency when no account is
  // selected, so showing that total under one currency symbol would be wrong.
  if (mixedCurrencies && !scopedId) {
    return (
      <Card className="glass-panel border-0 p-5 ring-0">
        {header}
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
        {header}
        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
          <Skeleton className="size-40 shrink-0 rounded-full" />
          <div className="w-full space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
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

  return (
    <Card className="glass-panel border-0 p-5 ring-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {header}
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList aria-label="Breakdown type">
            <TabsTrigger value="expense">Expenses</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

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
        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <Donut
            segments={segments}
            size={176}
            thickness={20}
            ariaLabel={`${isExpense ? "Spending" : "Income"} by category`}
            center={
              <>
                <span className="text-[11px] text-muted-foreground">Total {noun}</span>
                <MoneyAmount
                  amount={total}
                  currency={scopedCurrency}
                  compact
                  className="mt-0.5 text-lg font-semibold text-foreground"
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
                    <p className="text-[11px] text-muted-foreground tabular">{share}%</p>
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
