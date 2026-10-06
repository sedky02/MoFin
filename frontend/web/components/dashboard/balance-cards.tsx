"use client";

import { useLedgerBalance } from "@/hooks/useLedger";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { parseBalanceKey, pickPrimaryCurrency } from "@/lib/format";
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

export function BalanceCards({ accountId, accountName }: { accountId?: string; accountName?: string } = {}) {
  const { data, isLoading, isError, refetch } = useLedgerBalance({ accountId });
  const { data: user } = useUser();

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

  // Lead with the user's primary currency (same rule the monthly summary uses)
  // instead of whichever currency the API happened to list first.
  const primary = pickPrimaryCurrency(data, user);
  const totals = totalsByCurrency(data ?? []).sort(
    (a, b) => Number(b.currency === primary) - Number(a.currency === primary),
  );

  if (totals.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No balances yet"
        description="Add an account and record a transaction to see balances here."
        action={
          <Button asChild>
            <Link href="/accounts">Create your first account</Link>
          </Button>
        }
      />
    );
  }

  const [hero, ...rest] = totals;

  return (
    <div className="space-y-6">
      {/* HERO ZONE: LIVE PORTFOLIO PULSE */}
      <div className="glass-panel pulse-ring relative overflow-hidden rounded-3xl p-8 sm:p-10">
        <div className="scanline" aria-hidden />
        <div className="flex items-center gap-2.5">
          <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
          <span className="label-caps tracking-widest! text-primary-text!">
            {hero.currency} balance
          </span>
        </div>
        <MoneyAmount
          amount={hero.amount}
          currency={hero.currency}
          animate
          className="terminal-glow mt-4 block font-heading text-5xl font-extrabold tracking-tighter text-foreground sm:text-7xl"
        />
        <p className="mt-3 text-sm text-muted-foreground">
          {accountId ? `${accountName ?? "This account"}` : `Across all ${hero.currency} accounts`} · balances
          always exact
        </p>
      </div>

      {/* SECONDARY CURRENCY STAT BLOCKS */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2">
          {rest.map(({ currency, amount }) => (
            <Card
              key={currency}
              className="glass-panel relative overflow-hidden border-0 border-l-2 border-l-primary p-5 ring-0"
            >
              <div className="flex items-center justify-between">
                <span className="label-caps">{currency} balance</span>
              </div>
              <MoneyAmount
                amount={amount}
                currency={currency}
                animate
                colorBySign
                className="mt-3 block text-3xl font-semibold"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {accountId ? (accountName ?? "This account") : `Across all ${currency} accounts`}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
