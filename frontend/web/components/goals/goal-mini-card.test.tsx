// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GoalMiniCard } from "@/components/goals/goal-mini-card";
import type { Account, Goal } from "@/lib/types";

const account: Account = { id: "a1", name: "Main", type: "BANK", currency: "USD", createdAt: "", updatedAt: "" };

function goal(type: Goal["type"], progress: string, target: string, status: "IN_PROGRESS" | "ACHIEVED" | "FAILED"): Goal {
  return {
    id: "g1",
    accountId: "a1",
    name: "Holiday",
    type,
    targetAmount: target,
    isRecurring: false,
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2099-10-31T23:59:59Z",
    createdAt: "",
    updatedAt: "",
    currentInstance: {
      id: "i1",
      goalId: "g1",
      periodStart: "2026-10-01T00:00:00Z",
      periodEnd: "2099-10-31T23:59:59Z",
      targetAmount: target,
      progressAmount: progress,
      status,
      computedAt: "",
    },
  };
}

describe("GoalMiniCard", () => {
  afterEach(cleanup);

  it("shows the same progress ring as the Goals page, with the percent in it", () => {
    render(<GoalMiniCard goal={goal("BALANCE", "250", "1000", "IN_PROGRESS")} account={account} />);
    const ring = screen.getByRole("progressbar", { name: "Goal progress" });
    expect(ring.getAttribute("aria-valuenow")).toBe("25");
    expect(ring.textContent).toContain("25%");
    expect(ring.className).toContain("text-orange-400");
  });

  it("tops out at 100% and goes red for an expense over its cap", () => {
    render(<GoalMiniCard goal={goal("EXPENSE", "1500", "1000", "FAILED")} account={account} />);
    const ring = screen.getByRole("progressbar");
    expect(ring.textContent).toContain("100%");
    expect(ring.className).toContain("text-destructive");
    expect(screen.getByText("Over budget")).toBeTruthy();
  });

  it("names the goal with its progress and target", () => {
    const { container } = render(<GoalMiniCard goal={goal("BALANCE", "250", "1000", "IN_PROGRESS")} account={account} />);
    expect(screen.getByText("Holiday")).toBeTruthy();
    expect(container.textContent).toContain("$250.00");
    expect(container.textContent).toContain("$1,000.00");
  });
});
