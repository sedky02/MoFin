"use client";

import * as React from "react";
import { useLedgerBalance } from "@/hooks/useLedger";
import Link from "next/link";
import { useAccounts } from "@/hooks/useAccounts";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { pickPrimaryCurrency } from "@/lib/format";
import { tryParse } from "@/lib/decimal";
import { hiddenAccountIds, hiddenCaption, withoutHiddenBalances } from "@/lib/account-privacy";
import { allAccountsCaption, countArchivedHolding, totalsByCurrency, zeroTotals } from "@/lib/balances";
import { BalanceOverview } from "@/components/dashboard/balance-overview";
import { ErrorState, EmptyState } from "@/components/common/states";
import { BalanceHeroSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Wallet } from "lucide-react";

const isOverdrawn = (amount: string) => tryParse(amount)?.isNegative() ?? false;

export function BalanceCards({
  accountId,
  accountName,
  currency,
  onCurrencyChange,
  emptyPanel,
}: {
  accountId?: string;
  accountName?: string;
  /** A dashboard with nothing recorded: shown under the balance in place of the chart. */
  emptyPanel?: React.ReactNode;
  /** Controlled currency (shared with the Monthly Summary); falls back to local state when omitted. */
  currency?: string;
  onCurrencyChange?: (currency: string) => void;
} = {}) {
  const { data, isLoading, isError, refetch } = useLedgerBalance({ accountId });
  const { data: user } = useUser();
  // Active accounts only; any other account in the all-accounts balances is archived.
  const { data: activeAccounts, isLoading: accountsLoading } = useAccounts();
  // The user's explicit pick; falls back to the primary currency until they choose.
  const [localPicked, setLocalPicked] = React.useState<string | undefined>();
  const picked = currency ?? localPicked;
  const setPicked = onCurrencyChange ?? setLocalPicked;

  if (isLoading || (accountsLoading && !data?.length)) {
    return (
      <div className="flex h-full flex-col">
        <BalanceHeroSkeleton />
      </div>
    );
  }

  if (isError) {
    return <ErrorState description="Couldn't load your balances." onRetry={() => refetch()} />;
  }

  // Leads with the primary currency (same rule as the monthly summary), not whichever the API
  // listed first.
  const primary = pickPrimaryCurrency(data, user, "", activeAccounts);
  // Accounts with no ledger activity aren't in the balances: show them at zero in their own
  // currency.
  const scopedAccounts = (activeAccounts ?? []).filter((a) => !accountId || a.id === accountId);
  const ledgerTotals = totalsByCurrency(data ?? []);
  const noActivity = ledgerTotals.length === 0 && scopedAccounts.length > 0;
  // All accounts leaves hidden accounts out; a currency held only in hidden accounts keeps its
  // place in the switch, at zero.
  const hiddenIds = accountId ? [] : hiddenAccountIds(activeAccounts);
  const shownTotals = totalsByCurrency(withoutHiddenBalances(data ?? [], hiddenIds));
  const visibleTotals = ledgerTotals.map(
    (t) => shownTotals.find((s) => s.currency === t.currency) ?? { currency: t.currency, amount: "0" },
  );
  const totals = (noActivity ? zeroTotals(scopedAccounts) : visibleTotals).sort(
    (a, b) => Number(b.currency === primary) - Number(a.currency === primary),
  );

  if (totals.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No accounts yet"
        description="Add an account to start tracking your balances."
        action={
          <Button asChild>
            <Link href="/accounts">Add your first account</Link>
          </Button>
        }
      />
    );
  }

  const hero = totals.find((t) => t.currency === picked) ?? totals[0];

  // The all-accounts total keeps archived accounts' money (still the user's), so the caption says
  // when some of it is in this number.
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
        caption={
          accountId
            ? (accountName ?? "This account")
            : allAccountsCaption(hero.currency, archivedCount) +
              hiddenCaption(hiddenAccountIds(activeAccounts, hero.currency).length)
        }
        overdrawn={isOverdrawn(hero.amount)}
        accountId={accountId}
        account={accountId ? activeAccounts?.find((a) => a.id === accountId) : undefined}
        hiddenIds={accountId ? [] : hiddenAccountIds(activeAccounts, hero.currency)}
        currencies={totals.map((t) => ({ code: t.currency, overdrawn: isOverdrawn(t.amount) }))}
        onCurrencyChange={setPicked}
        emptyAction={
          noActivity ? (
            <Button asChild>
              <Link href="/transactions/new">Record your first transaction</Link>
            </Button>
          ) : undefined
        }
        emptyPanel={emptyPanel}
      />
    </div>
  );
}
