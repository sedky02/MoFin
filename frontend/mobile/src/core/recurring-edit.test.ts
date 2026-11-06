import {
  buildRecurringUpdate,
  recurringEndDateToIso,
  recurringFormValues,
  seriesAccountOptions,
} from "@/core/recurring-edit";
import type { Account, Transaction } from "@/core/types";

function rent(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "rent",
    type: "EXPENSE",
    description: "Rent (monthly)",
    currency: "TND",
    categoryId: "cat-rent",
    isRecurring: true,
    recurringInterval: "MONTHLY",
    recurringStatus: "ACTIVE",
    recurringEndDate: null,
    recurringAmount: "12.345",
    recurringFromAccountId: "dinar",
    recurringToAccountId: null,
    ...overrides,
  } as Transaction;
}

describe("recurringFormValues", () => {
  it("keeps the currency's decimals on the amount", () => {
    expect(recurringFormValues(rent()).amountRaw).toBe("12.345");
    expect(recurringFormValues(rent({ currency: "USD", recurringAmount: "40" })).amountRaw).toBe("40.00");
  });

  it("reads the end date back as the local day it was saved for", () => {
    const iso = recurringEndDateToIso("2027-03-31");
    expect(recurringFormValues(rent({ recurringEndDate: iso })).recurringEndDate).toBe("2027-03-31");
    expect(recurringFormValues(rent()).recurringEndDate).toBe("");
  });
});

describe("buildRecurringUpdate", () => {
  it("sends only the description when that's all that changed", () => {
    const initial = recurringFormValues(rent());
    const input = buildRecurringUpdate("EXPENSE", initial, { ...initial, description: "Rent, flat 2" });
    expect(input).toEqual({ description: "Rent, flat 2" });
    expect(input).not.toHaveProperty("amount");
  });

  it("sends nothing when nothing changed", () => {
    const initial = recurringFormValues(rent({ recurringEndDate: recurringEndDateToIso("2027-03-31") }));
    expect(buildRecurringUpdate("EXPENSE", initial, { ...initial })).toEqual({});
  });

  it("sends the parsed amount when the amount was edited", () => {
    const initial = recurringFormValues(rent());
    expect(buildRecurringUpdate("EXPENSE", initial, { ...initial, amountRaw: "13.5" })).toEqual({
      amount: "13.5",
    });
    expect(buildRecurringUpdate("EXPENSE", initial, { ...initial, amountRaw: "1,234.567" })).toEqual({
      amount: "1234.567",
    });
  });

  it("sends a changed end date as local end of day, and a cleared one as null", () => {
    const initial = recurringFormValues(rent({ recurringEndDate: recurringEndDateToIso("2027-03-31") }));
    expect(buildRecurringUpdate("EXPENSE", initial, { ...initial, recurringEndDate: "2027-06-30" })).toEqual({
      recurringEndDate: recurringEndDateToIso("2027-06-30"),
    });
    expect(buildRecurringUpdate("EXPENSE", initial, { ...initial, recurringEndDate: "" })).toEqual({
      recurringEndDate: null,
    });
  });

  it("sends changed category, account and interval", () => {
    const initial = recurringFormValues(rent());
    expect(
      buildRecurringUpdate("EXPENSE", initial, {
        ...initial,
        categoryId: "cat-housing",
        fromAccountId: "main",
        recurringInterval: "YEARLY",
      }),
    ).toEqual({ categoryId: "cat-housing", fromAccountId: "main", recurringInterval: "YEARLY" });
  });

  it("never sends the account a type doesn't use", () => {
    const initial = recurringFormValues(rent());
    expect(buildRecurringUpdate("EXPENSE", initial, { ...initial, toAccountId: "main" })).toEqual({});
    expect(buildRecurringUpdate("INCOME", initial, { ...initial, fromAccountId: "main" })).toEqual({});
  });
});

describe("seriesAccountOptions", () => {
  const account = (id: string, currency: string): Account => ({
    id,
    name: id,
    type: "BANK",
    currency,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const accounts = [account("main", "USD"), account("dinar", "TND"), account("savings", "USD")];

  it("offers only accounts in the series' currency", () => {
    expect(seriesAccountOptions(accounts, "USD").map((a) => a.id)).toEqual(["main", "savings"]);
    expect(seriesAccountOptions(accounts, "TND").map((a) => a.id)).toEqual(["dinar"]);
  });

  it("leaves out the other side of a transfer", () => {
    expect(seriesAccountOptions(accounts, "USD", "main").map((a) => a.id)).toEqual(["savings"]);
  });
});
