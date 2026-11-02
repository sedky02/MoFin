import { groupCancelledGoals } from "@/core/cancelled-goals";
import type { Goal } from "@/core/types";

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

describe("groupCancelledGoals", () => {
  it("puts the most recently cancelled first, grouped by the month they were cancelled", () => {
    const groups = groupCancelledGoals([
      goal("old", "2026-07-02T10:00:00Z"),
      goal("new", "2026-10-20T10:00:00Z"),
      goal("mid-a", "2026-09-03T10:00:00Z"),
      goal("mid-b", "2026-09-28T10:00:00Z"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["October 2026", "September 2026", "July 2026"]);
    expect(groups[1].goals.map((g) => g.id)).toEqual(["mid-b", "mid-a"]);
  });

  it("groups by UTC month, like the goal dates elsewhere", () => {
    const groups = groupCancelledGoals([goal("late", "2026-09-30T23:30:00Z"), goal("early", "2026-10-01T00:30:00Z")]);
    expect(groups.map((g) => g.key)).toEqual(["2026-10", "2026-09"]);
  });

  it("leaves out goals that were never cancelled, or have no usable date", () => {
    expect(groupCancelledGoals([goal("live", null), goal("bad", "nope")])).toEqual([]);
  });

  it("is empty for no goals", () => {
    expect(groupCancelledGoals([])).toEqual([]);
  });
});
