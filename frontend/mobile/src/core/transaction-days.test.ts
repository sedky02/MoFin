import { dayLabel, groupByDay } from "@/core/transaction-days";

// Local-time noon keeps every case away from a day boundary, whatever the machine's timezone.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const now = new Date(2026, 9, 29, 15); // Oct 29, 2026

describe("dayLabel", () => {
  it("says Today and Yesterday", () => {
    expect(dayLabel(at(2026, 10, 29), now).label).toBe("Today");
    expect(dayLabel(at(2026, 10, 28), now).label).toBe("Yesterday");
  });

  it("names any other day this year with its weekday, and leaves the year off", () => {
    const { label } = dayLabel(at(2026, 10, 6), now);
    expect(label).toMatch(/Oct/);
    expect(label).toMatch(/6/);
    expect(label).not.toMatch(/2026/);
  });

  it("adds the year for another year", () => {
    expect(dayLabel(at(2025, 12, 31), now).label).toMatch(/2025/);
  });

  it("gives days different keys and the same day the same key", () => {
    expect(dayLabel(at(2026, 10, 6), now).key).toBe(dayLabel(new Date(2026, 9, 6, 20).toISOString(), now).key);
    expect(dayLabel(at(2026, 10, 6), now).key).not.toBe(dayLabel(at(2026, 10, 7), now).key);
  });

  it("falls back to the raw value for a date it can't read", () => {
    expect(dayLabel("nope", now)).toEqual({ key: "nope", label: "nope" });
  });
});

describe("groupByDay", () => {
  const tx = (id: string, iso: string) => ({ id, occurredAt: iso });

  it("groups neighbours on the same day and keeps the order it was given", () => {
    const groups = groupByDay(
      [tx("a", at(2026, 10, 29)), tx("b", at(2026, 10, 29)), tx("c", at(2026, 10, 28)), tx("d", at(2026, 10, 20))],
      now,
    );
    expect(groups.map((g) => [g.label.slice(0, 5), g.rows.map((r) => r.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yeste", ["c"]],
      [groups[2].label.slice(0, 5), ["d"]],
    ]);
  });

  it("starts a new group when a day comes back later in the list (sorted by amount, say)", () => {
    const groups = groupByDay([tx("a", at(2026, 10, 29)), tx("b", at(2026, 10, 28)), tx("c", at(2026, 10, 29))], now);
    expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("is empty for no rows", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
