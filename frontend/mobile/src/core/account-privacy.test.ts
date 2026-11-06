import {
  hiddenAccountIds,
  hiddenCaption,
  isAmountHidden,
  MASKED_AMOUNT,
  withHideAmount,
  withoutHiddenBalances,
  withoutHiddenSeries,
} from "@/core/account-privacy";

describe("isAmountHidden", () => {
  it("is true only when the account says so", () => {
    expect(isAmountHidden({ metadata: { hideAmount: true } })).toBe(true);
    expect(isAmountHidden({ metadata: { hideAmount: "true" } })).toBe(false);
    expect(isAmountHidden({ metadata: {} })).toBe(false);
    expect(isAmountHidden({ metadata: null })).toBe(false);
    expect(isAmountHidden(undefined)).toBe(false);
  });
});

describe("withHideAmount", () => {
  it("sets or clears the choice and keeps every other metadata key", () => {
    expect(withHideAmount({ color: "red" }, true)).toEqual({ color: "red", hideAmount: true });
    expect(withHideAmount({ color: "red", hideAmount: true }, false)).toEqual({ color: "red" });
    expect(withHideAmount(null, false)).toEqual({});
    expect(withHideAmount(undefined, true)).toEqual({ hideAmount: true });
  });
});

it("masks with dots, no digits", () => {
  expect(MASKED_AMOUNT).not.toMatch(/\d/);
});

const hiddenAcc = (id: string, currency: string, hide: boolean) => ({ id, currency, metadata: hide ? { hideAmount: true } : {} });

describe("hiddenAccountIds", () => {
  it("lists hidden accounts, optionally in one currency", () => {
    const accounts = [hiddenAcc("a", "TND", true), hiddenAcc("b", "TND", false), hiddenAcc("c", "EUR", true)];
    expect(hiddenAccountIds(accounts)).toEqual(["a", "c"]);
    expect(hiddenAccountIds(accounts, "TND")).toEqual(["a"]);
    expect(hiddenAccountIds(undefined)).toEqual([]);
  });
});

describe("withoutHiddenBalances", () => {
  it("drops the hidden accounts' rows from all-accounts balances", () => {
    const rows = [
      { key: "a:TND", balance: "100" },
      { key: "b:TND", balance: "50" },
      { key: "c:EUR", balance: "7" },
    ];
    expect(withoutHiddenBalances(rows, ["a"])).toEqual([rows[1], rows[2]]);
    expect(withoutHiddenBalances(rows, [])).toBe(rows);
  });
});

describe("withoutHiddenSeries", () => {
  const p = (date: string, income: string, expenses: string, balance: string) => ({ date, income, expenses, balance });

  it("takes each hidden account's figures out of every day, exactly", () => {
    const all = [p("2026-11-02", "100", "30.5", "1000.25"), p("2026-11-03", "0", "10", "990.25")];
    const hidden = [[p("2026-11-02", "40", "0.5", "600.125"), p("2026-11-03", "0", "0", "600.125")]];
    expect(withoutHiddenSeries(all, hidden)).toEqual([
      p("2026-11-02", "60", "30", "400.125"),
      p("2026-11-03", "0", "10", "390.125"),
    ]);
  });

  it("leaves a day alone when a hidden series has no point for it, and the series alone with none hidden", () => {
    const all = [p("2026-11-02", "1", "2", "3")];
    expect(withoutHiddenSeries(all, [[]])).toEqual(all);
    expect(withoutHiddenSeries(all, [])).toBe(all);
  });
});

describe("hiddenCaption", () => {
  it("says how many accounts are left out", () => {
    expect(hiddenCaption(0)).toBe("");
    expect(hiddenCaption(1)).toBe(" · excl. 1 hidden account");
    expect(hiddenCaption(2)).toBe(" · excl. 2 hidden accounts");
  });
});
