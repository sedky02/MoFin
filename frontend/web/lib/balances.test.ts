import { describe, expect, it } from "vitest";
import { allAccountsCaption, countArchivedHolding, totalsByCurrency } from "@/lib/balances";

// Mirrors the UX fixture: two active USD accounts, an active and an archived EUR account.
const balances = [
  { key: "main:USD", balance: "3154.50" },
  { key: "emergency:USD", balance: "500.00" },
  { key: "travel:EUR", balance: "272.60" },
  { key: "old:EUR", balance: "800.00" },
];
const activeIds = ["main", "emergency", "travel"];

describe("totalsByCurrency", () => {
  it("sums every account per currency, archived ones included", () => {
    expect(totalsByCurrency(balances)).toEqual([
      { currency: "USD", amount: "3654.5" },
      { currency: "EUR", amount: "1072.6" },
    ]);
  });
});

describe("countArchivedHolding", () => {
  it("counts archived accounts holding money in that currency", () => {
    expect(countArchivedHolding(balances, activeIds, "EUR")).toBe(1);
  });

  it("is zero for a currency only active accounts hold", () => {
    expect(countArchivedHolding(balances, activeIds, "USD")).toBe(0);
  });

  it("ignores an archived account whose balance is zero", () => {
    const withEmpty = [...balances, { key: "closed:EUR", balance: "0" }];
    expect(countArchivedHolding(withEmpty, activeIds, "EUR")).toBe(1);
  });

  it("counts an overdrawn archived account", () => {
    const withNegative = [...balances, { key: "card:EUR", balance: "-12.00" }];
    expect(countArchivedHolding(withNegative, activeIds, "EUR")).toBe(2);
  });
});

describe("allAccountsCaption", () => {
  it("says nothing about archived accounts when none count", () => {
    expect(allAccountsCaption("USD", 0)).toBe("Across all USD accounts");
  });

  it("names a single archived account", () => {
    expect(allAccountsCaption("EUR", 1)).toBe("Across all EUR accounts · incl. 1 archived account");
  });

  it("pluralises several", () => {
    expect(allAccountsCaption("EUR", 2)).toBe("Across all EUR accounts · incl. 2 archived accounts");
  });
});
