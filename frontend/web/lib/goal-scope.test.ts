import { describe, expect, it } from "vitest";
import { goalScopeLabel } from "./goal-scope";

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
