// Shared by the server prefetch and the client so both ask for the same query keys: a server-primed
// cache only helps if the client reads exactly what the server wrote.
import type { Account, LedgerBalance } from "@/core/types";
import { parseBalanceKey } from "@/core/format";

/** Cookie mirroring the client's active-account choice, so the server can prefetch for it. */
export const ACTIVE_ACCOUNT_COOKIE = "mofin-active-account";
/** Stored when the user explicitly picks "All accounts" (distinct from "never chose"). */
export const ALL_ACCOUNTS = "all";

export const DASHBOARD_RECENT_LIMIT = 15;

/**
 * The explicit pick, else the main account; "All accounts" is explicit and never falls back to
 * main. Resolved against the live list so an archived or deleted account stops being active.
 */
export function resolveActiveAccount(
  stored: string | undefined,
  accounts: Account[],
  mainAccountId: string | undefined,
): Account | undefined {
  if (stored === ALL_ACCOUNTS) return undefined;
  return accounts.find((a) => a.id === stored) ?? accounts.find((a) => a.id === mainAccountId);
}

export function orderCurrencies(items: { currency: string }[], primaryCurrency: string): string[] {
  return [...new Set(items.map((a) => a.currency))].sort(
    (a, b) => Number(b === primaryCurrency) - Number(a === primaryCurrency),
  );
}

export function resolveCurrency(opts: {
  pick?: string;
  account?: Account;
  currencies: string[];
  primaryCurrency: string;
}): string {
  const { pick, account, currencies, primaryCurrency } = opts;
  return (
    account?.currency ??
    (pick && currencies.includes(pick) ? pick : undefined) ??
    (currencies.includes(primaryCurrency) ? primaryCurrency : currencies[0]) ??
    primaryCurrency
  );
}

/**
 * One account's balances cut from the all-accounts ones (same rows as
 * `/ledger/balance?accountId=`), saving the prefetch a request.
 */
export function scopeBalances(all: LedgerBalance[], accountId: string): LedgerBalance[] {
  return all.flatMap((b) => {
    const { accountId: owner, currency } = parseBalanceKey(b.key);
    return owner === accountId ? [{ ...b, key: currency }] : [];
  });
}

/**
 * Amounts can't be summed across currencies, so an all-accounts view always asks for one (the API
 * requires it).
 */
export function summaryApiCurrency(accountId: string | undefined, currency: string): string | undefined {
  return accountId ? undefined : currency;
}

/**
 * Currencies the summary switch offers: the active accounts', every currency with activity in the
 * viewed month (archived included), and the one shown.
 */
export function summaryCurrencyOptions(
  accountCurrencies: string[],
  activeCurrencies: string[],
  selected: string,
): string[] {
  return [...new Set([...accountCurrencies, ...activeCurrencies, selected])];
}
