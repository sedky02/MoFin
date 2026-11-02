import { heroHeadline } from "./hero-headline";
import type { MonthlySeriesPoint } from "./types";

const point = (month: string, income: string, expenses: string, balance: string): MonthlySeriesPoint => ({
  month,
  income,
  expenses,
  balance,
});
const bal = { amount: "1500.00", caption: "All accounts" };
const series = [point("2026-09", "1000.00", "400.00", "1380.00"), point("2026-10", "900.00", "440.00", "1500.00")];

describe("heroHeadline", () => {
  it("balance: keeps the balance and caption, chip is the balance change", () => {
    const h = heroHeadline("balance", series, bal, "en-US");
    expect(h.amount).toBe("1500.00");
    expect(h.caption).toBe("All accounts");
    expect(h.chip).toEqual({ prefix: "Balance change", delta: "120", suffix: "this month", tone: "good" });
  });

  it("balance: a drop is bad news", () => {
    const h = heroHeadline("balance", [point("2026-09", "0", "0", "100"), point("2026-10", "0", "0", "60")], bal, "en-US");
    expect(h.chip).toMatchObject({ delta: "-40", tone: "bad" });
  });

  it("expenses: this month's spend, more than last month is bad", () => {
    const h = heroHeadline("expenses", series, bal, "en-US");
    expect(h.amount).toBe("440.00");
    expect(h.caption).toBe("Spent in October");
    expect(h.chip).toEqual({ prefix: null, delta: "40", suffix: "vs Sep", tone: "bad" });
  });

  it("expenses: spending less is good", () => {
    const h = heroHeadline("expenses", [point("2026-09", "0", "500", "0"), point("2026-10", "0", "300", "0")], bal, "en-US");
    expect(h.chip).toMatchObject({ delta: "-200", tone: "good" });
  });

  it("income: this month's income, less than last month is bad", () => {
    const h = heroHeadline("income", series, bal, "en-US");
    expect(h.amount).toBe("900.00");
    expect(h.caption).toBe("Earned in October");
    expect(h.chip).toEqual({ prefix: null, delta: "-100", suffix: "vs Sep", tone: "bad" });
  });

  it("income: earning more is good", () => {
    const h = heroHeadline("income", [point("2026-09", "100", "0", "0"), point("2026-10", "250", "0", "0")], bal, "en-US");
    expect(h.chip).toMatchObject({ delta: "150", tone: "good" });
  });

  it("a month with no data is zero with no chip when last month was empty too", () => {
    const empty = [point("2026-09", "0", "0", "0"), point("2026-10", "0", "0", "0")];
    for (const metric of ["expenses", "income", "balance"] as const) {
      expect(heroHeadline(metric, empty, bal, "en-US").chip).toBeNull();
    }
    expect(heroHeadline("expenses", empty, bal, "en-US").amount).toBe("0");
  });

  it("a month with no activity after a busy one shows zero and the full drop", () => {
    const h = heroHeadline("expenses", [point("2026-09", "0", "75", "0"), point("2026-10", "0", "0", "0")], bal, "en-US");
    expect(h.amount).toBe("0");
    expect(h.chip).toMatchObject({ delta: "-75", tone: "good" });
  });

  it("a first month with no previous month has no chip", () => {
    const first = [point("2026-10", "900.00", "440.00", "1500.00")];
    for (const metric of ["expenses", "income", "balance"] as const) {
      expect(heroHeadline(metric, first, bal, "en-US").chip).toBeNull();
    }
    expect(heroHeadline("income", first, bal, "en-US").amount).toBe("900.00");
  });

  it("no series yet: zero for expenses and income, the balance as given", () => {
    expect(heroHeadline("expenses", [], bal, "en-US")).toEqual({ amount: "0", caption: "Spent this month", chip: null });
    expect(heroHeadline("income", [], bal, "en-US").caption).toBe("Earned this month");
    expect(heroHeadline("balance", [], bal, "en-US")).toEqual({ ...bal, chip: null });
  });
});
