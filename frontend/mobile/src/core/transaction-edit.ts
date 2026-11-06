import { add } from "./decimal";
import { formatMoneyInput, toDatetimeLocal } from "./format";
import { transactionAccountLegs } from "./transaction-accounts";
import type { TransactionFormValues } from "./transaction-schema";
import type { Transaction } from "./types";

/**
 * The total comes from the ledger lines (a transaction has no amount of its own), formatted with
 * the currency's decimals.
 */
export function transactionFormValues(tx: Transaction): TransactionFormValues {
  const { from, to } = transactionAccountLegs(tx);
  const split = tx.type !== "TRANSFER" && tx.items.length > 1;
  const total =
    tx.type === "TRANSFER"
      ? ((from ?? to)?.amount ?? "0")
      : tx.items.reduce((sum, item) => add(sum, item.amount), "0");

  return {
    type: tx.type,
    description: tx.description,
    amountRaw: formatMoneyInput(total, tx.currency),
    currency: tx.currency,
    fromAccountId: tx.type !== "INCOME" ? from?.accountId : undefined,
    toAccountId: tx.type !== "EXPENSE" ? to?.accountId : undefined,
    categoryId:
      split || tx.type === "TRANSFER" ? undefined : (tx.categoryId ?? tx.items[0]?.categoryId ?? undefined),
    occurredAt: toDatetimeLocal(tx.occurredAt),
    items: split
      ? tx.items.map((item) => ({
          amountRaw: formatMoneyInput(item.amount, tx.currency),
          categoryId: item.categoryId ?? undefined,
          description: item.memo && item.memo !== tx.description ? item.memo : "",
        }))
      : [],
    isRecurring: false,
    recurringInterval: undefined,
    recurringEndDate: "",
  };
}

/**
 * Not editable when it moved money through an archived account: nothing can be posted to one (the
 * API refuses) and the form's list only offers active accounts.
 */
export function editBlockedByArchivedAccount(tx: Pick<Transaction, "items">): boolean {
  return tx.items.some((item) => !!item.account?.archivedAt);
}
