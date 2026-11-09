import { goalHeadline, goalProgressSourceLabel, goalRuleHint, goalScopeLabel, goalTargetLine } from "./goal-scope";
import type { Goal } from "@/core/types";

describe("goalScopeLabel", () => {
  it("says what an expense goal counts", () => {
    expect(goalScopeLabel("EXPENSE", "Main checking")).toBe("Counts all expenses from Main checking");
  });

  it("says what an income goal counts", () => {
    expect(goalScopeLabel("INCOME", "Main checking")).toBe("Counts all income into Main checking");
  });

  it("says a balance goal tracks the balance", () => {
    expect(goalScopeLabel("BALANCE", "Emergency fund")).toBe("Tracks the balance of Emergency fund");
  });

  it("falls back to a generic account when none is known", () => {
    expect(goalScopeLabel("EXPENSE")).toBe("Counts all expenses from this account");
    expect(goalScopeLabel("INCOME", "  ")).toBe("Counts all income into this account");
  });
});

describe("goalRuleHint", () => {
  it("says transfers in don't count toward an income goal", () => {
    expect(goalRuleHint("INCOME")).toBe(
      "Transfers in don't count. Once reached, it stays achieved for the rest of the period.",
    );
  });

  it("points savers to the balance goal, where transfers in count", () => {
    expect(goalRuleHint("BALANCE")).toMatch(
      /^Saving\? A Balance goal tracks the account's balance, so transfers in count\./,
    );
  });

  it("says an expense cap ignores transfers and is judged at period end", () => {
    expect(goalRuleHint("EXPENSE")).toBe("Transfers out don't count. Judged when the period ends.");
  });
});

describe("goalProgressSourceLabel", () => {
  it("labels the open period as live and finished ones as recorded", () => {
    expect(goalProgressSourceLabel("LIVE")).toBe("Current period (live)");
    expect(goalProgressSourceLabel("PERIOD_END")).toBe("Recorded at period end");
    expect(goalProgressSourceLabel("ENDED")).toBe("Frozen when the goal was cancelled");
  });
});

describe("goalHeadline", () => {
  const g = (type: Goal["type"], progressAmount: string, targetAmount = "300") =>
    ({
      type,
      targetAmount,
      currentInstance: { progressAmount, targetAmount },
    }) as Goal;

  it("says what is left under a cap, or how far over it is", () => {
    expect(goalHeadline(g("EXPENSE", "310", "450"))).toEqual({
      amount: "140",
      label: "left",
    });
    expect(goalHeadline(g("EXPENSE", "372.74"))).toEqual({
      amount: "72.74",
      label: "over",
    });
  });

  it("says what is still to go on a reach goal, or how far above it is", () => {
    expect(goalHeadline(g("BALANCE", "3000", "5000"))).toEqual({
      amount: "2000",
      label: "to go",
    });
    expect(goalHeadline(g("INCOME", "1200", "1000"))).toEqual({
      amount: "200",
      label: "above",
    });
  });
});

describe("goalTargetLine", () => {
  const base = {
    targetAmount: "300",
    currentInstance: null,
    isRecurring: true,
    recurrenceUnit: "MONTH",
  } as Goal;

  it("words the target for each type, dropping zero cents", () => {
    expect(goalTargetLine({ ...base, type: "EXPENSE" }, "USD")).toBe("of your $300 monthly limit");
    expect(goalTargetLine({ ...base, type: "INCOME", recurrenceUnit: "YEAR" }, "USD")).toBe(
      "of your $300 yearly target",
    );
    expect(goalTargetLine({ ...base, type: "BALANCE", isRecurring: false }, "USD")).toBe("to save $300");
  });

  it("keeps the cents when there are some", () => {
    expect(goalTargetLine({ ...base, type: "EXPENSE", targetAmount: "299.5" }, "USD")).toBe(
      "of your $299.50 monthly limit",
    );
  });
});
