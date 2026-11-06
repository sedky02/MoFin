// An account whose amounts the user chose to hide (the eye on its Accounts card). The choice is
// stored in the account's metadata, so it follows them to every device. Its own amounts show as
// dots (the dashboard's eye reveals them until reload), and "All accounts" figures leave it out.
import { subtract } from "@/lib/decimal";
import { parseBalanceKey } from "@/lib/format";
import type { Account, DailySeriesPoint, LedgerBalance } from "@/lib/types";

/** What a hidden amount shows instead of digits. */
export const MASKED_AMOUNT = "••••";

export function isAmountHidden(account: Pick<Account, "metadata"> | null | undefined): boolean {
  return account?.metadata?.hideAmount === true;
}

/**
 * The account's metadata with the choice set, every other key kept: the API replaces `metadata`
 * as a whole, so sending only `{ hideAmount }` would drop the rest.
 */
export function withHideAmount(
  metadata: Account["metadata"],
  hide: boolean,
): Record<string, unknown> {
  const { hideAmount: _old, ...rest } = metadata ?? {};
  void _old;
  return hide ? { ...rest, hideAmount: true } : rest;
}

/**
 * The accounts whose amounts stay out of "All accounts" figures, optionally only those in
 * `currency` (the figures are per currency).
 */
export function hiddenAccountIds(
  accounts: Pick<Account, "id" | "currency" | "metadata">[] | null | undefined,
  currency?: string,
): string[] {
  return (accounts ?? [])
    .filter((a) => isAmountHidden(a) && (!currency || a.currency === currency))
    .map((a) => a.id);
}

/** All-accounts balance rows ("<accountId>:<currency>") without the hidden accounts' rows. */
export function withoutHiddenBalances(balances: LedgerBalance[], hiddenIds: string[]): LedgerBalance[] {
  if (hiddenIds.length === 0) return balances;
  const hidden = new Set(hiddenIds);
  return balances.filter((b) => {
    const { accountId } = parseBalanceKey(b.key);
    return !accountId || !hidden.has(accountId);
  });
}

/**
 * An all-accounts day series with the hidden accounts' own series taken out, day by day: income,
 * expenses and closing balance then describe the accounts the user can see.
 */
export function withoutHiddenSeries(
  all: DailySeriesPoint[],
  hiddenSeries: DailySeriesPoint[][],
): DailySeriesPoint[] {
  if (hiddenSeries.length === 0) return all;
  return all.map((point) =>
    hiddenSeries.reduce((p, series) => {
      const h = series.find((x) => x.date === point.date);
      return h
        ? {
            ...p,
            income: subtract(p.income, h.income),
            expenses: subtract(p.expenses, h.expenses),
            balance: subtract(p.balance, h.balance),
          }
        : p;
    }, point),
  );
}

/** " · excl. 2 hidden accounts", for an all-accounts caption ("" when none are hidden). */
export function hiddenCaption(count: number): string {
  return count > 0 ? ` · excl. ${count} hidden account${count === 1 ? "" : "s"}` : "";
}
