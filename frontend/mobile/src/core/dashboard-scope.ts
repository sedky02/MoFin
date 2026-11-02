// Pure helpers that decide which account and currency the dashboard shows. Shared by the
// server prefetch (app/(app)/dashboard/page.tsx) and the client (useActiveAccount,
// DashboardBody) so both always ask for the same query keys: a server-primed cache is only
// useful when the client reads exactly what the server wrote.
import type { Account, LedgerBalance } from "@/core/types";
import { parseBalanceKey } from "@/core/format";

/** Cookie mirroring the client's active-account choice, so the server can prefetch for it. */
export const ACTIVE_ACCOUNT_COOKIE = "mofin-active-account";
/** Stored when the user explicitly picks "All accounts" (distinct from "never chose"). */
export const ALL_ACCOUNTS = "all";

/** Rows fetched for the dashboard's recent-transactions card. */
export const DASHBOARD_RECENT_LIMIT = 15;

/**
 * The account the dashboard is scoped to: the explicit pick, else the user's main
 * account. "All accounts" is an explicit choice and never falls back to main. Resolved
 * against the live account list so an archived/deleted account stops being active.
 */
export function resolveActiveAccount(
  stored: string | undefined,
  accounts: Account[],
  mainAccountId: string | undefined,
): Account | undefined {
  if (stored === ALL_ACCOUNTS) return undefined;
  return accounts.find((a) => a.id === stored) ?? accounts.find((a) => a.id === mainAccountId);
}

/** Distinct currencies of the given accounts or balances, the primary one first. */
export function orderCurrencies(items: { currency: string }[], primaryCurrency: string): string[] {
  return [...new Set(items.map((a) => a.currency))].sort(
    (a, b) => Number(b === primaryCurrency) - Number(a === primaryCurrency),
  );
}

/** The currency a dashboard card shows: the account's own, else the user's pick, else primary. */
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
 * One account's balances, cut from the all-accounts ones: the same rows the API returns for
 * `/ledger/balance?accountId=…`, keyed by currency alone. Saves the dashboard prefetch a
 * request and a round trip.
 */
export function scopeBalances(all: LedgerBalance[], accountId: string): LedgerBalance[] {
  return all.flatMap((b) => {
    const { accountId: owner, currency } = parseBalanceKey(b.key);
    return owner === accountId ? [{ ...b, key: currency }] : [];
  });
}

/**
 * Currency parameter the monthly-summary request carries. Amounts can't be summed across
 * currencies, so an all-accounts view always asks for one (the API requires it: even with a
 * single active account, an archived one in another currency can still have activity). A
 * single account's summary is already in that account's currency.
 */
export function summaryApiCurrency(accountId: string | undefined, currency: string): string | undefined {
  return accountId ? undefined : currency;
}

/**
 * Currencies the monthly summary's switch offers: those of the active accounts, plus every
 * currency with activity in the viewed month (`activeCurrencies`, which includes archived
 * accounts), plus the one shown. Account currencies keep their order (primary first).
 */
export function summaryCurrencyOptions(
  accountCurrencies: string[],
  activeCurrencies: string[],
  selected: string,
): string[] {
  return [...new Set([...accountCurrencies, ...activeCurrencies, selected])];
}
