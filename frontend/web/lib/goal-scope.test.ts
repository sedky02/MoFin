import { describe, expect, it } from "vitest";
import { goalProgressSourceLabel, goalRuleHint, goalScopeLabel } from "./goal-scope";

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
    expect(goalProgressSourceLabel("ENDED")).toBe("Frozen when the goal was ended");
  });
});
