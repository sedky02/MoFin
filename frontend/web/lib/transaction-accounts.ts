import type { Account, LedgerItem, Transaction } from "./types";

export const DELETED_ACCOUNT_LABEL = "Deleted account";

/**
 * Display name for a ledger leg's account. Prefers the account the backend
 * embedded in the leg, then the user's account list (which must be fetched
 * with status "all" so archived accounts resolve too). Never falls back to the
 * raw id. Returns `undefined` while the list is still loading and the leg has
 * no embedded account, so callers can show a placeholder instead of flashing
 * "Deleted account".
 */
export function ledgerAccountName(
  item: Pick<LedgerItem, "accountId" | "account">,
  accountsById: ReadonlyMap<string, Account> | undefined,
): string | undefined {
  if (item.account?.name) return item.account.name;
  if (!accountsById) return undefined;
  return accountsById.get(item.accountId)?.name ?? DELETED_ACCOUNT_LABEL;
}

/**
 * The account(s) a transaction moved money between, read from its ledger legs
 * (DEBIT = out of an account, CREDIT = into it). Income only has `to`, expense
 * only has `from`, a transfer has both. A reversal's legs are already flipped,
 * so its from/to are the original's swapped, which is what it actually did.
 */
export function transactionAccountLegs(tx: Pick<Transaction, "items">): {
  from?: LedgerItem;
  to?: LedgerItem;
} {
  return {
    from: tx.items.find((item) => item.direction === "DEBIT"),
    to: tx.items.find((item) => item.direction === "CREDIT"),
  };
}
