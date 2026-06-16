"use client";

import { useLedgerBalance } from "@/hooks/useLedger";
import { parseBalanceKey } from "@/lib/format";
import { add } from "@/lib/decimal";
import { MoneyAmount } from "@/components/common/money-amount";
import { SkeletonCard, ErrorState, EmptyState } from "@/components/common/states";
import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";

// Sum balances by currency (never across currencies). key = "<accountId>:<currency>".
function totalsByCurrency(balances: { key: string; balance: string }[]) {
  const totals = new Map<string, string>();
  for (const { key, balance } of balances) {
    const { currency } = parseBalanceKey(key);
    totals.set(currency, add(totals.get(currency) ?? "0", balance));
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

export function BalanceCards() {
  const { data, isLoading, isError, refetch } = useLedgerBalance();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState description="Couldn't load your balances." onRetry={() => refetch()} />;
  }

  const totals = totalsByCurrency(data ?? []);

  if (totals.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No balances yet"
        description="Add an account and record a transaction to see balances here."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {totals.map(({ currency, amount }, i) => (
        <Card
          key={currency}
          className="relative overflow-hidden border-0 bg-card p-5 shadow-sm"
        >
          {/* subtle teal corner glow on the primary card */}
          {i === 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/10 blur-2xl"
            />
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {currency} balance
            </span>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground tabular">
              {currency}
            </span>
          </div>
          <MoneyAmount
            amount={amount}
            currency={currency}
            animate
            colorBySign
            className="mt-3 block text-3xl font-semibold"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Across all {currency} accounts
          </p>
        </Card>
      ))}
    </div>
  );
}
