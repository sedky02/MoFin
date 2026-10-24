// Pure helpers for the all-accounts balance hero. The unscoped /ledger/balance
// response covers every account the user owns, archived ones included: archived
// accounts are read-only, but their money is still theirs and still in the ledger.
import { parseBalanceKey } from "@/lib/format";
import { add, tryParse } from "@/lib/decimal";
import type { LedgerBalance } from "@/lib/types";

/** Sum balances by currency (never across currencies). key = "<accountId>:<currency>". */
export function totalsByCurrency(balances: LedgerBalance[]): { currency: string; amount: string }[] {
  const totals = new Map<string, string>();
  for (const { key, balance } of balances) {
    const { currency } = parseBalanceKey(key);
    totals.set(currency, add(totals.get(currency) ?? "0", balance));
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

/**
 * Zero totals, one per currency of `accounts`, for an account that exists but has no ledger
 * activity yet (the balance endpoint lists nothing for it). Order follows the accounts.
 */
export function zeroTotals(accounts: { currency: string }[]): { currency: string; amount: string }[] {
  return [...new Set(accounts.map((a) => a.currency))].map((currency) => ({ currency, amount: "0" }));
}

/**
 * How many accounts outside `activeAccountIds` (i.e. archived) hold a non-zero
 * balance in `currency`. Those are part of the all-accounts total, so the hero
 * says so; an archived account at zero changes nothing and isn't counted.
 */
export function countArchivedHolding(
  balances: LedgerBalance[],
  activeAccountIds: string[],
  currency: string,
): number {
  const active = new Set(activeAccountIds);
  const archived = new Set<string>();
  for (const { key, balance } of balances) {
    const { accountId, currency: c } = parseBalanceKey(key);
    if (!accountId || c !== currency || active.has(accountId)) continue;
    if (tryParse(balance)?.isZero() === false) archived.add(accountId);
  }
  return archived.size;
}

/** Hero caption for the all-accounts view, naming archived accounts when they count. */
export function allAccountsCaption(currency: string, archivedCount: number): string {
  const base = `Across all ${currency} accounts`;
  if (archivedCount === 0) return base;
  return `${base} · incl. ${archivedCount} archived account${archivedCount === 1 ? "" : "s"}`;
}
