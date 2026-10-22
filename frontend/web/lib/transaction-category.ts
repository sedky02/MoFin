import type { Category, Transaction } from "./types";

export const UNCATEGORIZED_LABEL = "Uncategorized";

export interface TransactionCategorySummary {
  /** True when the transaction is split into several lines. */
  split: boolean;
  /** "Groceries", "Uncategorized", or for a split across several categories "2 categories". */
  label: string;
  /** The one category that describes the whole transaction; null when there isn't one. */
  category: Pick<Category, "name" | "color"> | null;
}

/**
 * What a transaction is filed under, for list rows. An unsplit transaction uses
 * its own category. A split carries no category of its own (older ones may still
 * have the stale pre-split pick, which is ignored); its lines are grouped by
 * category instead, and uncategorized lines count as one group, the same
 * "Uncategorized" bucket the monthly summary shows.
 */
export function transactionCategorySummary(
  tx: Pick<Transaction, "type" | "category" | "items">,
): TransactionCategorySummary {
  if (tx.type === "TRANSFER" || tx.items.length <= 1) {
    const category = tx.category ?? null;
    return { split: false, label: category?.name ?? UNCATEGORIZED_LABEL, category };
  }

  const groups = new Map<string | null, Category | null>();
  for (const item of tx.items) {
    groups.set(item.category?.id ?? item.categoryId ?? null, item.category ?? null);
  }
  if (groups.size === 1) {
    const [category] = groups.values();
    return { split: true, label: category?.name ?? UNCATEGORIZED_LABEL, category };
  }
  return { split: true, label: `${groups.size} categories`, category: null };
}
