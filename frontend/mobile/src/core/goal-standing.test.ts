import {
  goalStanding,
  goalTimeLeft,
  goalTone,
  groupGoalsByStanding,
} from "@/core/goal-standing";
import type { Goal, GoalStatus, GoalType } from "@/core/types";

// Mid-period: 16 of the 31 days of October have gone by.
const NOW = new Date("2026-10-16T12:00:00Z");

function goal(type: GoalType, progress: string, target: string, status: GoalStatus, over: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    accountId: "a1",
    name: "My goal",
    type,
    targetAmount: target,
    isRecurring: true,
    recurrenceUnit: "MONTH",
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-10-31T23:59:59.999Z",
    createdAt: "",
    updatedAt: "",
    currentInstance: {
      id: "i1",
      goalId: "g1",
      periodStart: "2026-10-01T00:00:00Z",
      periodEnd: "2026-10-31T23:59:59.999Z",
      targetAmount: target,
      progressAmount: progress,
      status,
      computedAt: "",
    },
    ...over,
  };
}

describe("goalStanding", () => {
  it("puts a failed goal and an expense over its cap under Needs attention", () => {
    expect(goalStanding(goal("INCOME", "0", "100", "FAILED"), NOW)).toBe("attention");
    expect(goalStanding(goal("EXPENSE", "468", "400", "IN_PROGRESS"), NOW)).toBe("attention");
  });

  it("calls a reach goal behind when progress trails the share of the period gone", () => {
    expect(goalTone(goal("BALANCE", "-160", "1200", "IN_PROGRESS"), NOW)).toBe("behind");
    expect(goalStanding(goal("BALANCE", "-160", "1200", "IN_PROGRESS"), NOW)).toBe("attention");
    expect(goalTone(goal("BALANCE", "600", "1200", "IN_PROGRESS"), NOW)).toBe("on-track");
  });

  it("gives a young period some slack before calling a goal behind", () => {
    const day2 = new Date("2026-10-02T12:00:00Z");
    expect(goalTone(goal("INCOME", "0", "1000", "IN_PROGRESS"), day2)).toBe("on-track");
  });

  it("calls a spending cap behind when spending runs ahead of the clock", () => {
    expect(goalTone(goal("EXPENSE", "300", "400", "IN_PROGRESS"), NOW)).toBe("behind");
    expect(goalTone(goal("EXPENSE", "150", "400", "IN_PROGRESS"), NOW)).toBe("on-track");
  });

  it("keeps an achieved goal under Achieved", () => {
    expect(goalStanding(goal("INCOME", "3240", "3000", "ACHIEVED"), NOW)).toBe("achieved");
  });

  it("is on track when the goal has no open period", () => {
    expect(goalTone(goal("BALANCE", "0", "100", "IN_PROGRESS", { currentInstance: null }), NOW)).toBe("on-track");
  });

  it("colours a cancelled goal by its frozen result only", () => {
    const cancelled = { archivedAt: "2026-10-10T00:00:00Z" };
    expect(goalTone(goal("INCOME", "3240", "3000", "ACHIEVED", cancelled), NOW)).toBe("achieved");
    expect(goalTone(goal("INCOME", "1", "3000", "FAILED", cancelled), NOW)).toBe("failed");
    expect(goalTone(goal("BALANCE", "-5", "3000", "IN_PROGRESS", cancelled), NOW)).toBe("cancelled");
  });
});

describe("groupGoalsByStanding", () => {
  it("orders the groups and drops empty ones", () => {
    const groups = groupGoalsByStanding(
      [
        goal("INCOME", "3240", "3000", "ACHIEVED", { id: "a" }),
        goal("BALANCE", "600", "1200", "IN_PROGRESS", { id: "b" }),
        goal("EXPENSE", "468", "400", "FAILED", { id: "c" }),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.standing, g.goals.map((x) => x.id)])).toEqual([
      ["attention", ["c"]],
      ["on-track", ["b"]],
      ["achieved", ["a"]],
    ]);
    expect(groupGoalsByStanding([goal("BALANCE", "600", "1200", "IN_PROGRESS")], NOW)).toHaveLength(1);
  });
});

describe("goalTimeLeft", () => {
  const end = (iso: string, over: Partial<Goal> = {}) =>
    goal("BALANCE", "1", "10", "IN_PROGRESS", {
      currentInstance: { ...goal("BALANCE", "1", "10", "IN_PROGRESS").currentInstance!, periodEnd: iso },
      ...over,
    });

  it("says a recurring goal resets tomorrow on its last day", () => {
    expect(goalTimeLeft(end("2026-10-16T23:59:59.999Z"), NOW)).toBe("Resets tomorrow");
  });

  it("counts the days until a recurring goal resets", () => {
    expect(goalTimeLeft(end("2026-10-31T23:59:59.999Z"), NOW)).toBe("Resets in 16 days");
  });

  it("says when a one-off goal ends", () => {
    const once = { isRecurring: false, recurrenceUnit: null };
    expect(goalTimeLeft(end("2026-10-16T23:59:59.999Z", once), NOW)).toBe("Ends today");
    expect(goalTimeLeft(end("2026-10-17T23:59:59.999Z", once), NOW)).toBe("Ends tomorrow");
    expect(goalTimeLeft(end("2026-10-31T23:59:59.999Z", once), NOW)).toBe("Ends in 15 days");
  });

  it("says nothing for a cancelled goal or a period already over", () => {
    expect(goalTimeLeft(end("2026-10-31T23:59:59.999Z", { archivedAt: "2026-10-10T00:00:00Z" }), NOW)).toBeNull();
    expect(goalTimeLeft(end("2026-10-01T23:59:59.999Z"), NOW)).toBeNull();
  });
});
