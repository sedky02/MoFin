"use client";

import * as React from "react";
import { useLedgerBalance } from "@/hooks/useLedger";
import Link from "next/link";
import { useAccounts } from "@/hooks/useAccounts";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { pickPrimaryCurrency } from "@/lib/format";
import { tryParse } from "@/lib/decimal";
import { allAccountsCaption, countArchivedHolding, totalsByCurrency } from "@/lib/balances";
import { BalanceOverview } from "@/components/dashboard/balance-overview";
import { SkeletonCard, ErrorState, EmptyState } from "@/components/common/states";
import { Wallet } from "lucide-react";

const isOverdrawn = (amount: string) => tryParse(amount)?.isNegative() ?? false;

export function BalanceCards({
  accountId,
  accountName,
  currency,
  onCurrencyChange,
}: {
  accountId?: string;
  accountName?: string;
  /** Controlled currency (shared with the Monthly Summary); falls back to local state when omitted. */
  currency?: string;
  onCurrencyChange?: (currency: string) => void;
} = {}) {
  const { data, isLoading, isError, refetch } = useLedgerBalance({ accountId });
  const { data: user } = useUser();
  // Active accounts only; any other account in the all-accounts balances is archived.
  const { data: activeAccounts } = useAccounts();
  // The user's explicit pick; falls back to the primary currency until they choose.
  const [localPicked, setLocalPicked] = React.useState<string | undefined>();
  const picked = currency ?? localPicked;
  const setPicked = onCurrencyChange ?? setLocalPicked;

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

  const hero = totals.find((t) => t.currency === picked) ?? totals[0];

  // The all-accounts total keeps archived accounts' money (it is still the user's, and
  // still in the ledger), so the caption says when any of it is in this number.
  const archivedCount =
    !accountId && activeAccounts
      ? countArchivedHolding(data ?? [], activeAccounts.map((a) => a.id), hero.currency)
      : 0;

  return (
    // h-full: the hero stretches to the row height so it ends level with the Goals card.
    <div className="flex h-full flex-col">
      <BalanceOverview
        amount={hero.amount}
        currency={hero.currency}
        caption={accountId ? (accountName ?? "This account") : allAccountsCaption(hero.currency, archivedCount)}
        overdrawn={isOverdrawn(hero.amount)}
        accountId={accountId}
        currencies={totals.map((t) => ({ code: t.currency, overdrawn: isOverdrawn(t.amount) }))}
        onCurrencyChange={setPicked}
      />
    </div>
  );
}
