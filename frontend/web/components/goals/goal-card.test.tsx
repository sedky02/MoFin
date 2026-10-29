// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GoalCard } from "@/components/goals/goal-card";
import type { Account, Goal, GoalStatus, GoalType } from "@/lib/types";

const account: Account = {
  id: "a1",
  name: "Main checking",
  type: "BANK",
  currency: "USD",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function goal(type: GoalType, progress: string, target: string, status: GoalStatus, over: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    accountId: "a1",
    name: "My goal",
    type,
    targetAmount: target,
    isRecurring: false,
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-10-31T23:59:59.999Z",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    currentInstance: {
      id: "i1",
      goalId: "g1",
      periodStart: "2026-10-01T00:00:00Z",
      periodEnd: "2026-10-31T23:59:59.999Z",
      targetAmount: target,
      progressAmount: progress,
      status,
      computedAt: "2026-10-28T00:00:00Z",
    },
    ...over,
  };
}

const show = (g: Goal, extra: Partial<React.ComponentProps<typeof GoalCard>> = {}) =>
  render(<GoalCard goal={g} account={account} onViewHistory={() => {}} {...extra} />);

describe("GoalCard", () => {
  afterEach(cleanup);

  it("shows only the type, recurrence, status, name, amount, target, percent and progress", () => {
    const { container } = show(
      goal("INCOME", "3240", "3000", "ACHIEVED", { isRecurring: true, recurrenceUnit: "MONTH" }),
    );
    expect(screen.getByText("Income")).toBeTruthy();
    expect(screen.getByText("Every month")).toBeTruthy();
    expect(screen.getByText("Achieved")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "My goal" })).toBeTruthy();
    // MoneyAmount draws each figure twice (a visible one and a screen-reader one).
    expect(screen.getAllByText("$3,240.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$3,000.00").length).toBeGreaterThan(0);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText("108%")).toBeTruthy();

    // Gone: the date range, the days left, and the "to go" line.
    expect(screen.queryByText(/Oct 1, 2026/)).toBeNull();
    expect(screen.queryByText(/days? left/)).toBeNull();
    expect(screen.queryByText(/to go|over the cap|left to spend|past the target/)).toBeNull();
    // The one percentage on the card is the share reached.
    const percents = Array.from(container.querySelectorAll("*")).filter(
      (el) => el.children.length === 0 && /^\d+%$/.test(el.textContent ?? ""),
    );
    expect(percents.map((el) => el.textContent)).toEqual(["108%"]);
  });

  it("keeps the scope sentence for screen readers only, so the account isn't lost", () => {
    show(goal("BALANCE", "1", "10", "IN_PROGRESS"));
    const scope = screen.getByTestId("goal-scope");
    expect(scope.textContent).toBe("Tracks the balance of Main checking");
    expect(scope.className).toContain("sr-only");
  });

  it("fills the bar to the share of the target reached, and says the percent", () => {
    show(goal("BALANCE", "6200.50", "10000", "IN_PROGRESS"));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("62");
    expect(screen.getByText("62%")).toBeTruthy();
  });

  it("starts at 0% and caps the bar, but not the number, once the target is passed", () => {
    show(goal("BALANCE", "0", "100", "IN_PROGRESS"));
    expect(screen.getByText("0%")).toBeTruthy();
    cleanup();
    show(goal("INCOME", "3240", "3000", "ACHIEVED"));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("108%")).toBeTruthy();
  });

  it("turns an expense goal over its cap red, bar and amount", () => {
    show(goal("EXPENSE", "468.20", "400", "FAILED"));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toContain("over target");
    expect(screen.getByText("117%").className).toContain("text-destructive");
    const amount = screen.getAllByText("$468.20").find((el) => el.closest(".text-destructive"));
    expect(amount).toBeTruthy();
  });

  it("does not turn an income goal red for passing its target", () => {
    show(goal("INCOME", "3240", "3000", "ACHIEVED"));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).not.toContain("over target");
  });

  it("names a yearly recurrence", () => {
    show(goal("INCOME", "1", "10", "IN_PROGRESS", { isRecurring: true, recurrenceUnit: "YEAR" }));
    expect(screen.getByText("Every year")).toBeTruthy();
  });

  it("offers Edit and End goal on an active goal, and Restore on an ended one", async () => {
    const user = (await import("@testing-library/user-event")).default;
    show(goal("BALANCE", "1", "10", "IN_PROGRESS"), { onEdit: () => {}, onStop: () => {} });
    await user.click(screen.getByRole("button", { name: "Actions for My goal" }));
    expect(screen.getByRole("menuitem", { name: "View history" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "End goal" })).toBeTruthy();
    cleanup();

    show(goal("BALANCE", "1", "10", "IN_PROGRESS", { archivedAt: "2026-09-15T00:00:00Z" }), {
      readOnly: true,
      onRestore: () => {},
    });
    await user.click(screen.getByRole("button", { name: "Actions for My goal" }));
    expect(screen.getByRole("menuitem", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "End goal" })).toBeNull();
  });

  it("hides 'In progress' on an ended goal, whose open period was frozen unjudged", () => {
    show(goal("BALANCE", "2100", "5000", "IN_PROGRESS", { archivedAt: "2026-09-15T00:00:00Z" }), { readOnly: true });
    expect(screen.queryByText("In progress")).toBeNull();
  });

  it("copes with a goal that has no open period", () => {
    show(goal("BALANCE", "0", "100", "IN_PROGRESS", { currentInstance: null }));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("keeps the progress amount the first semibold figure, which the e2e specs read", () => {
    const { container } = show(goal("BALANCE", "6200.50", "10000", "IN_PROGRESS"));
    expect(container.querySelector(".tabular.font-semibold")?.textContent).toContain("$6,200.50");
  });
});
