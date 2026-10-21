import { describe, expect, it } from "vitest";
import { transactionCategorySummary } from "@/lib/transaction-category";
import type { Category, LedgerItem, Transaction } from "@/lib/types";

const category = (id: string, name: string, color: string | null = null): Category => ({
  id,
  name,
  color,
  type: "EXPENSE",
  isSystem: false,
});
const groceries = category("groceries", "Groceries", "#22c55e");
const dining = category("dining", "Dining", "#f97316");

const line = (amount: string, cat: Category | null = null): LedgerItem => ({
  id: `item-${amount}`,
  transactionId: "tx",
  accountId: "main",
  categoryId: cat?.id ?? null,
  category: cat,
  direction: "DEBIT",
  amount,
  currency: "USD",
});

const tx = (fields: Pick<Transaction, "items"> & Partial<Pick<Transaction, "type" | "category">>) => ({
  type: "EXPENSE" as const,
  category: null,
  ...fields,
});

describe("transactionCategorySummary", () => {
  it("uses an unsplit transaction's own category", () => {
    expect(transactionCategorySummary(tx({ category: groceries, items: [line("10")] }))).toEqual({
      split: false,
      label: "Groceries",
      category: groceries,
    });
  });

  it("calls an unsplit transaction without a category Uncategorized", () => {
    expect(transactionCategorySummary(tx({ items: [line("10")] }))).toMatchObject({
      split: false,
      label: "Uncategorized",
      category: null,
    });
  });

  it("counts a split's distinct line categories and ignores a stale top-level one", () => {
    const summary = transactionCategorySummary(
      tx({ category: groceries, items: [line("30", groceries), line("15", dining), line("5", dining)] }),
    );
    expect(summary).toEqual({ split: true, label: "2 categories", category: null });
  });

  it("counts a split's uncategorized lines as one group", () => {
    const summary = transactionCategorySummary(
      tx({ items: [line("30", groceries), line("10"), line("5")] }),
    );
    expect(summary.label).toBe("2 categories");
  });

  it("names the category when every line of a split shares it", () => {
    expect(
      transactionCategorySummary(tx({ items: [line("30", dining), line("15", dining)] })),
    ).toEqual({ split: true, label: "Dining", category: dining });
  });

  it("calls a split with no line categories Uncategorized", () => {
    expect(transactionCategorySummary(tx({ items: [line("30"), line("15")] }))).toEqual({
      split: true,
      label: "Uncategorized",
      category: null,
    });
  });

  it("never treats a transfer's two legs as a split", () => {
    expect(
      transactionCategorySummary(tx({ type: "TRANSFER", items: [line("30"), line("30")] })),
    ).toMatchObject({ split: false });
  });
});
