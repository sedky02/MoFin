import { barLabel, chartTableRows } from "./hero-chart-a11y";
import type { MonthlySeriesPoint } from "./types";

const p = (month: string, income: string, expenses: string, balance: string): MonthlySeriesPoint => ({
  month,
  income,
  expenses,
  balance,
});

describe("barLabel", () => {
  it("names the month and the value of the current metric", () => {
    const pt = p("2026-10", "900.00", "440.00", "12345.67");
    expect(barLabel("October 2026", "balance", pt, "USD")).toMatch(/^October 2026: balance .*12,345\.67/);
    expect(barLabel("October 2026", "expenses", pt, "USD")).toMatch(/expenses .*440\.00/);
    expect(barLabel("October 2026", "income", pt, "USD")).toMatch(/income .*900\.00/);
  });
});

describe("chartTableRows", () => {
  it("has one row per month with month, income, expenses, balance", () => {
    const rows = chartTableRows([p("2026-09", "1", "2", "3"), p("2026-10", "4", "5", "6")], "USD", (m) => `L${m}`);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe("L2026-09");
    expect(rows[1]).toHaveLength(4);
  });

  it("shows 0 in the currency's precision when a figure is missing", () => {
    const [usd] = chartTableRows([p("2026-09", "", "x", "1")], "USD", (m) => m);
    expect(usd[1]).toMatch(/0\.00/);
    expect(usd[2]).toMatch(/0\.00/);
    const [kwd] = chartTableRows([p("2026-09", "", "", "")], "KWD", (m) => m);
    expect(kwd[1]).toMatch(/0\.000/);
    const [jpy] = chartTableRows([p("2026-09", "", "", "")], "JPY", (m) => m);
    expect(jpy[1]).not.toMatch(/\./);
  });
});
