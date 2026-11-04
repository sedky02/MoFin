import { describe, expect, it } from "vitest";
import { addDaysIso, mondayOf, pastDays, scaleY, weekHeadline, weekRange, weekScale, weekTitle } from "./week";
import type { DailySeriesPoint } from "./types";

const day = (date: string, income = "0", expenses = "0", balance = "0"): DailySeriesPoint => ({ date, income, expenses, balance });

describe("week dates", () => {
  it("finds the Monday of any day, Sunday included", () => {
    expect(mondayOf("2026-11-04")).toBe("2026-11-02");
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
  });

  it("adds days across a month end", () => {
    expect(addDaysIso("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDaysIso("2026-11-02", -7)).toBe("2026-10-26");
  });

  it("names the week", () => {
    expect(weekRange("2026-11-02", "en-US")).toBe("Nov 2 – 8");
    expect(weekRange("2026-10-26", "en-US")).toBe("Oct 26 – Nov 1");
    expect(weekTitle("2026-11-02", "2026-11-04")).toBe("This week");
    expect(weekTitle("2026-10-26", "2026-11-04")).toBe("Last week");
    expect(weekTitle("2026-10-19", "2026-11-04", "en-US")).toBe("Oct 19 – 25");
  });

  it("keeps only the days that have happened", () => {
    expect(pastDays([day("2026-11-03"), day("2026-11-04"), day("2026-11-05")], "2026-11-04").map((p) => p.date)).toEqual([
      "2026-11-03",
      "2026-11-04",
    ]);
  });
});

describe("weekScale", () => {
  it("rounds the top up to a nice step from zero", () => {
    expect(weekScale([10, 40, 0])).toEqual({ min: 0, max: 40, ticks: [40, 20, 0] });
    expect(weekScale([12, 70])).toEqual({ min: 0, max: 75, ticks: [75, 50, 25, 0] });
    expect(weekScale([1.5, 1.25, 33.5])).toEqual({ min: 0, max: 40, ticks: [40, 20, 0] });
  });

  it("goes below zero for negative values", () => {
    const s = weekScale([-50.5, -51.75, -85.25]);
    expect(s.max).toBe(0);
    expect(s.min).toBe(-100);
    expect(s.ticks).toEqual([0, -50, -100]);
    expect(scaleY(0, s)).toBe(0);
    expect(scaleY(-100, s)).toBe(1);
  });

  it("spans zero when values have both signs", () => {
    const s = weekScale([-20, 60]);
    expect(s.ticks[0]).toBeGreaterThanOrEqual(60);
    expect(s.ticks).toContain(0);
    expect(s.min).toBeLessThanOrEqual(-20);
  });

  it("has a unit axis when everything is zero", () => {
    expect(weekScale([0, 0])).toEqual({ min: 0, max: 1, ticks: [1, 0] });
  });
});

describe("weekHeadline", () => {
  const live = { amount: "-85.25", caption: "Across all TND accounts" };
  const points = [
    ...Array.from({ length: 7 }, (_, i) => day(addDaysIso("2026-10-26", i), "0", i === 6 ? "10" : "0", "-49")),
    day("2026-11-02", "0", "1.5", "-50.5"),
    day("2026-11-03", "0", "1.25", "-51.75"),
    day("2026-11-04", "0", "33.5", "-85.25"),
    ...Array.from({ length: 4 }, (_, i) => day(addDaysIso("2026-11-05", i), "0", "0", "-85.25")),
  ];

  it("shows the live balance this week, with the week's change", () => {
    expect(weekHeadline("balance", points, "2026-11-02", "2026-11-04", live)).toEqual({
      amount: "-85.25",
      caption: "Across all TND accounts",
      chip: { prefix: "Balance change", delta: "-36.25", suffix: "this week", tone: "bad" },
    });
  });

  it("sums this week's spending so far and compares it with the week before", () => {
    const h = weekHeadline("expenses", points, "2026-11-02", "2026-11-04", live);
    expect(h.amount).toBe("36.25");
    expect(h.caption).toBe("Spent this week");
    expect(h.chip).toEqual({ prefix: null, delta: "26.25", suffix: "vs the week before", tone: "bad" });
  });

  it("shows a past week's closing balance and range", () => {
    const h = weekHeadline("balance", points, "2026-11-02", "2026-11-20", live, "en-US");
    expect(h.amount).toBe("-85.25");
    expect(h.caption).toBe("Balance at the end of Nov 2 – 8");
    expect(h.chip?.suffix).toBe("that week");
  });

  it("has no chip without a change", () => {
    expect(weekHeadline("income", points, "2026-11-02", "2026-11-04", live).chip).toBeNull();
  });
});
