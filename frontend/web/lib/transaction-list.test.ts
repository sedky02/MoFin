import { describe, expect, it } from "vitest";
import { transactionAccountLabel } from "@/lib/transaction-accounts";
import {
  accountOptionLabel,
  parseRecurrence,
  parseSort,
  parseType,
  parseView,
} from "@/lib/transaction-list-params";
import type { Account, LedgerItem } from "@/lib/types";

const account = (id: string, name: string, archivedAt: string | null = null): Account => ({
  id,
  name,
  type: "BANK",
  currency: "USD",
  archivedAt,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const leg = (direction: LedgerItem["direction"], acc: Account, embed = true): LedgerItem => ({
  id: `${direction}-${acc.id}`,
  transactionId: "tx",
  accountId: acc.id,
  account: embed ? acc : undefined,
  direction,
  amount: "500",
  currency: "USD",
});

const checking = account("checking", "Main checking");
const emergency = account("emergency", "Emergency fund");
const oldSavings = account("old", "Old savings", "2026-09-01T00:00:00.000Z");

describe("transactionAccountLabel", () => {
  it("names both sides of a transfer", () => {
    const items = [leg("DEBIT", checking), leg("CREDIT", emergency)];
    expect(transactionAccountLabel({ type: "TRANSFER", items })).toBe("Main checking → Emergency fund");
  });

  it("names the one account an expense or income touched, archived or not", () => {
    expect(transactionAccountLabel({ type: "EXPENSE", items: [leg("DEBIT", checking)] })).toBe("Main checking");
    expect(transactionAccountLabel({ type: "INCOME", items: [leg("CREDIT", oldSavings)] })).toBe("Old savings");
  });

  it("falls back to the account list, and waits for it rather than guessing", () => {
    const items = [leg("DEBIT", checking, false)];
    expect(transactionAccountLabel({ type: "EXPENSE", items })).toBeUndefined();
    expect(transactionAccountLabel({ type: "EXPENSE", items }, new Map([[checking.id, checking]]))).toBe(
      "Main checking",
    );
  });
});

describe("transaction list params", () => {
  it("reads known values and drops anything else", () => {
    expect(parseType("TRANSFER")).toBe("TRANSFER");
    expect(parseType("transfer")).toBeUndefined();
    expect(parseRecurrence("one-off")).toBe("one-off");
    expect(parseRecurrence("all")).toBeUndefined();
    expect(parseSort("amount-desc")).toBe("amount-desc");
    expect(parseSort(undefined)).toBeUndefined();
  });

  it("keeps the Recurring view's own query values out of the list filters", () => {
    // `series` and `next-occurrence` are the Recurring view's; a URL can't put them on the list.
    expect(parseRecurrence("series")).toBeUndefined();
    expect(parseSort("next-occurrence")).toBeUndefined();
  });

  it("opens the Recurring view only on ?view=recurring", () => {
    expect(parseView("recurring")).toBe("recurring");
    expect(parseView(undefined)).toBe("all");
    expect(parseView("Recurring")).toBe("all");
  });

  it("labels archived accounts in the account filter", () => {
    expect(accountOptionLabel(oldSavings)).toBe("Old savings (archived)");
    expect(accountOptionLabel(checking)).toBe("Main checking");
  });
});
