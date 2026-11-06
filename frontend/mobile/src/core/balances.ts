// The unscoped /ledger/balance covers every account, archived included: archived accounts are
// read-only but their money is still the user's.
import { parseBalanceKey } from "@/core/format";
import { add, tryParse } from "@/core/decimal";
import type { LedgerBalance } from "@/core/types";

export function totalsByCurrency(balances: LedgerBalance[]): { currency: string; amount: string }[] {
  const totals = new Map<string, string>();
  for (const { key, balance } of balances) {
    const { currency } = parseBalanceKey(key);
    totals.set(currency, add(totals.get(currency) ?? "0", balance));
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

/**
 * Zero totals for an account with no ledger activity yet (the balance endpoint lists nothing for
 * it).
 */
export function zeroTotals(accounts: { currency: string }[]): { currency: string; amount: string }[] {
  return [...new Set(accounts.map((a) => a.currency))].map((currency) => ({ currency, amount: "0" }));
}

/**
 * Archived accounts holding a non-zero balance count in the all-accounts total, so the hero says
 * so; one at zero changes nothing.
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

export function allAccountsCaption(currency: string, archivedCount: number): string {
  const base = `Across all ${currency} accounts`;
  if (archivedCount === 0) return base;
  return `${base} · incl. ${archivedCount} archived account${archivedCount === 1 ? "" : "s"}`;
}
