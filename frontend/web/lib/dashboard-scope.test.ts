import { describe, expect, it } from "vitest";
import { scopeBalances, summaryApiCurrency, summaryCurrencyOptions } from "@/lib/dashboard-scope";

describe("scopeBalances", () => {
  const all = [
    { key: "acc-1:TND", balance: "120.500" },
    { key: "acc-2:EUR", balance: "40.00" },
    { key: "acc-1:EUR", balance: "-3.00" },
  ];

  it("keeps one account's rows, keyed by currency like the scoped API response", () => {
    expect(scopeBalances(all, "acc-1")).toEqual([
      { key: "TND", balance: "120.500" },
      { key: "EUR", balance: "-3.00" },
    ]);
  });

  it("is empty for an account with no balance", () => {
    expect(scopeBalances(all, "acc-3")).toEqual([]);
  });
});

describe("summaryApiCurrency", () => {
  it("always names the currency for an all-accounts summary, even with one active currency", () => {
    expect(summaryApiCurrency(undefined, "TND")).toBe("TND");
  });

  it("leaves it out for one account (its own currency)", () => {
    expect(summaryApiCurrency("acc-1", "TND")).toBeUndefined();
  });
});

describe("summaryCurrencyOptions", () => {
  it("adds currencies that only have activity this month, e.g. an archived account's", () => {
    expect(summaryCurrencyOptions(["TND"], ["EUR", "TND"], "TND")).toEqual(["TND", "EUR"]);
  });

  it("keeps the account currencies' order and lists each currency once", () => {
    expect(summaryCurrencyOptions(["TND", "USD"], ["USD", "TND"], "TND")).toEqual(["TND", "USD"]);
  });

  it("keeps the selected currency even before the month's activity has loaded", () => {
    expect(summaryCurrencyOptions(["TND"], [], "EUR")).toEqual(["TND", "EUR"]);
  });
});
