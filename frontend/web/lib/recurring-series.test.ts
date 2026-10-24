import { describe, expect, it } from "vitest";
import {
  seriesAccountLabel,
  seriesAmount,
  seriesIntervalLabel,
  seriesIsActive,
  seriesNextOccurrence,
} from "@/lib/recurring-series";
import type { Account, LedgerItem, Transaction } from "@/lib/types";

const account = (id: string, name: string, archivedAt: string | null = null): Account => ({
  id,
  name,
  type: "BANK",
  currency: "USD",
  archivedAt,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const leg = (direction: LedgerItem["direction"], acc: Account, amount = "500", embed = true): LedgerItem => ({
  id: `${direction}-${acc.id}`,
  transactionId: "root",
  accountId: acc.id,
  account: embed ? acc : undefined,
  direction,
  amount,
  currency: "USD",
});

const checking = account("checking", "Main checking");
const emergency = account("emergency", "Emergency fund");
const dinar = account("dinar", "Dinar");
const oldSavings = account("old", "Old savings", "2026-09-01T00:00:00.000Z");
const byId = (...accounts: Account[]) => new Map(accounts.map((a) => [a.id, a]));

function root(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "root",
    type: "EXPENSE",
    description: "Rent (monthly)",
    currency: "TND",
    occurredAt: "2026-06-05T09:00:00.000Z",
    items: [leg("DEBIT", dinar, "12.345")],
    createdAt: "2026-06-05T09:00:00.000Z",
    updatedAt: "2026-06-05T09:00:00.000Z",
    isRecurring: true,
    recurringInterval: "MONTHLY",
    recurringStatus: "ACTIVE",
    nextOccurrenceAt: "2026-11-05T09:00:00.000Z",
    recurringAmount: "12.345",
    recurringFromAccountId: "dinar",
    recurringToAccountId: null,
    parentTransactionId: null,
    ...overrides,
  };
}

describe("seriesAmount", () => {
  it("is the template amount, which an edit can change after the root was posted", () => {
    expect(seriesAmount(root({ recurringAmount: "15.000" }))).toBe("15.000");
  });

  it("falls back to the root's own total without a template amount", () => {
    expect(seriesAmount(root({ recurringAmount: null }))).toBe("12.345");
  });
});

describe("seriesNextOccurrence", () => {
  it("is the next date of an active series", () => {
    expect(seriesNextOccurrence(root())).toBe("2026-11-05T09:00:00.000Z");
    expect(seriesIsActive(root())).toBe(true);
  });

  it("is nothing once cancelled, even though the root still carries a date", () => {
    const cancelled = root({ recurringStatus: "CANCELLED" });
    expect(seriesNextOccurrence(cancelled)).toBeUndefined();
    expect(seriesIsActive(cancelled)).toBe(false);
  });

  it("is nothing for an ended series", () => {
    expect(seriesNextOccurrence(root({ recurringStatus: "CANCELLED", nextOccurrenceAt: null }))).toBeUndefined();
  });
});

describe("seriesIntervalLabel", () => {
  it("names the cadence", () => {
    expect(seriesIntervalLabel(root())).toBe("Monthly");
    expect(seriesIntervalLabel(root({ recurringInterval: "YEARLY" }))).toBe("Yearly");
  });
});

describe("seriesAccountLabel", () => {
  it("names the account an expense series posts from", () => {
    expect(seriesAccountLabel(root(), byId(dinar))).toBe("Dinar");
  });

  it("reads the template account, not the root's leg, after the series moved accounts", () => {
    expect(seriesAccountLabel(root({ recurringFromAccountId: "checking" }), byId(dinar, checking))).toBe("Main checking");
  });

  it("names the account an income series posts to", () => {
    const salary = root({
      type: "INCOME",
      items: [leg("CREDIT", checking)],
      recurringFromAccountId: null,
      recurringToAccountId: "checking",
    });
    expect(seriesAccountLabel(salary, byId(checking))).toBe("Main checking");
  });

  it("names both sides of a transfer series", () => {
    const transfer = root({
      type: "TRANSFER",
      items: [leg("DEBIT", checking), leg("CREDIT", emergency)],
      recurringFromAccountId: "checking",
      recurringToAccountId: "emergency",
    });
    expect(seriesAccountLabel(transfer, byId(checking, emergency))).toBe("Main checking → Emergency fund");
  });

  it("names an archived account", () => {
    expect(seriesAccountLabel(root({ recurringFromAccountId: "old" }), byId(dinar, oldSavings))).toBe("Old savings");
  });

  it("uses the root's embedded leg while the account list loads", () => {
    expect(seriesAccountLabel(root())).toBe("Dinar");
  });

  it("is unresolved while the list loads and no leg names the template account", () => {
    expect(seriesAccountLabel(root({ recurringFromAccountId: "checking" }))).toBeUndefined();
  });

  it("says the account is gone once the list has loaded without it", () => {
    expect(seriesAccountLabel(root({ recurringFromAccountId: "gone" }), byId(dinar))).toBe("Deleted account");
  });

  it("falls back to the root's legs when the template names no account", () => {
    const legacy = root({ recurringFromAccountId: null, items: [leg("DEBIT", dinar, "12.345", false)] });
    expect(seriesAccountLabel(legacy, byId(dinar))).toBe("Dinar");
  });
});
