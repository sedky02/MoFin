import { describe, expect, it } from "vitest";
import { groupEndedGoals } from "@/lib/ended-goals";
import type { Goal } from "@/lib/types";

const goal = (id: string, archivedAt: string | null): Goal => ({
  id,
  accountId: "a1",
  name: id,
  type: "BALANCE",
  targetAmount: "100",
  isRecurring: false,
  periodStart: "2026-01-01T00:00:00Z",
  archivedAt,
  createdAt: "",
  updatedAt: "",
  currentInstance: null,
});

describe("groupEndedGoals", () => {
  it("puts the most recently ended first, grouped by the month they were ended", () => {
    const groups = groupEndedGoals([
      goal("old", "2026-07-02T10:00:00Z"),
      goal("new", "2026-10-20T10:00:00Z"),
      goal("mid-a", "2026-09-03T10:00:00Z"),
      goal("mid-b", "2026-09-28T10:00:00Z"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["October 2026", "September 2026", "July 2026"]);
    expect(groups[1].goals.map((g) => g.id)).toEqual(["mid-b", "mid-a"]);
  });

  it("groups by UTC month, like the goal dates elsewhere", () => {
    const groups = groupEndedGoals([goal("late", "2026-09-30T23:30:00Z"), goal("early", "2026-10-01T00:30:00Z")]);
    expect(groups.map((g) => g.key)).toEqual(["2026-10", "2026-09"]);
  });

  it("leaves out goals that were never ended, or have no usable date", () => {
    expect(groupEndedGoals([goal("live", null), goal("bad", "nope")])).toEqual([]);
  });

  it("is empty for no goals", () => {
    expect(groupEndedGoals([])).toEqual([]);
  });
});
