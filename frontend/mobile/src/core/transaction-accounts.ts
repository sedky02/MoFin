import type { Account, LedgerItem, Transaction } from "./types";

export const DELETED_ACCOUNT_LABEL = "Deleted account";

/**
 * Prefers the account embedded in the leg, then the user's account list (fetched with status "all"
 * so archived accounts resolve). Never falls back to the raw id; undefined while loading.
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
 * Read from the ledger legs (DEBIT = out of an account, CREDIT = into it): income only has `to`,
 * expense only `from`, a transfer both.
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

/**
 * The account a list row names, or "From → To" for a transfer; undefined while a name can't be
 * resolved (see ledgerAccountName).
 */
export function transactionAccountLabel(
  tx: Pick<Transaction, "type" | "items">,
  accountsById?: ReadonlyMap<string, Account>,
): string | undefined {
  const { from, to } = transactionAccountLegs(tx);
  const name = (item?: LedgerItem) => (item ? ledgerAccountName(item, accountsById) : undefined);
  if (tx.type === "TRANSFER") {
    const fromName = name(from);
    const toName = name(to);
    return fromName && toName ? `${fromName} → ${toName}` : (fromName ?? toName);
  }
  return name(from ?? to);
}
