import type { Category, Transaction } from "./types";

export const UNCATEGORIZED_LABEL = "Uncategorized";

export interface TransactionCategorySummary {
  split: boolean;
  label: string;
  category: Pick<Category, "name" | "color"> | null;
}

/**
 * What a transaction is filed under, for list rows: an unsplit one uses its own category; a split
 * has none of its own (older ones may carry a stale pre-split pick that must be ignored).
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
