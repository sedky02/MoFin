import { describe, expect, it } from "vitest";
import { summaryApiCurrency, summaryCurrencyOptions } from "@/lib/dashboard-scope";

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
