import { describe, expect, it } from "vitest";
import { editBlockedByArchivedAccount, transactionFormValues } from "@/lib/transaction-edit";
import type { LedgerItem, Transaction } from "@/lib/types";

const leg = (overrides: Partial<LedgerItem>): LedgerItem =>
  ({ id: "i", transactionId: "t", accountId: "main", direction: "DEBIT", amount: "0", currency: "USD", ...overrides }) as LedgerItem;

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t",
    type: "EXPENSE",
    description: "Groceries",
    currency: "USD",
    categoryId: null,
    occurredAt: "2026-10-03T09:30:00.000Z",
    isRecurring: false,
    items: [],
    ...overrides,
  } as Transaction;
}

describe("transactionFormValues", () => {
  it("fills an expense from its single line, with the currency's decimals", () => {
    const v = transactionFormValues(
      tx({ categoryId: "groceries", items: [leg({ amount: "45.5", categoryId: "groceries", memo: "Groceries" })] }),
    );
    expect(v).toMatchObject({
      type: "EXPENSE",
      description: "Groceries",
      amountRaw: "45.50",
      currency: "USD",
      fromAccountId: "main",
      toAccountId: undefined,
      categoryId: "groceries",
      items: [],
      isRecurring: false,
    });
  });

  it("keeps 3 decimals for TND", () => {
    const v = transactionFormValues(tx({ currency: "TND", items: [leg({ amount: "12.345", currency: "TND" })] }));
    expect(v.amountRaw).toBe("12.345");
  });

  it("puts income on the to-account and a transfer on both, with the amount of one leg", () => {
    const income = transactionFormValues(
      tx({ type: "INCOME", items: [leg({ accountId: "main", direction: "CREDIT", amount: "3000" })] }),
    );
    expect(income).toMatchObject({ fromAccountId: undefined, toAccountId: "main", amountRaw: "3000.00" });

    const transfer = transactionFormValues(
      tx({
        type: "TRANSFER",
        categoryId: null,
        items: [
          leg({ accountId: "main", direction: "DEBIT", amount: "500" }),
          leg({ accountId: "savings", direction: "CREDIT", amount: "500" }),
        ],
      }),
    );
    expect(transfer).toMatchObject({ fromAccountId: "main", toAccountId: "savings", amountRaw: "500.00", categoryId: undefined });
  });

  it("brings a split back as split rows, with the total of its lines and no category of its own", () => {
    const v = transactionFormValues(
      tx({
        description: "Supermarket and pharmacy receipt",
        items: [
          leg({ amount: "71.30", categoryId: "groceries", memo: "Food" }),
          leg({ amount: "25", categoryId: "utilities", memo: "Supermarket and pharmacy receipt" }),
        ],
      }),
    );
    expect(v.amountRaw).toBe("96.30");
    expect(v.categoryId).toBeUndefined();
    expect(v.items).toEqual([
      { amountRaw: "71.30", categoryId: "groceries", description: "Food" },
      // Saved without a note, so its memo is the description: not shown back as a note.
      { amountRaw: "25.00", categoryId: "utilities", description: "" },
    ]);
  });

  it("uses the date in local time, for the datetime-local input", () => {
    const v = transactionFormValues(tx({ items: [leg({ amount: "1" })] }));
    const d = new Date("2026-10-03T09:30:00.000Z");
    expect(v.occurredAt).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    );
  });
});

describe("editBlockedByArchivedAccount", () => {
  it("is true only when a line's account is archived", () => {
    const active = { id: "main", name: "Main", archivedAt: null } as LedgerItem["account"];
    const archived = { id: "old", name: "Old savings", archivedAt: "2026-09-01T00:00:00Z" } as LedgerItem["account"];
    expect(editBlockedByArchivedAccount({ items: [leg({ account: active })] })).toBe(false);
    expect(editBlockedByArchivedAccount({ items: [leg({ account: active }), leg({ account: archived })] })).toBe(true);
  });
});
