// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GoalRow } from "@/components/goals/goal-row";
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
    periodEnd: "2099-10-31T23:59:59.999Z",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    currentInstance: {
      id: "i1",
      goalId: "g1",
      periodStart: "2026-10-01T00:00:00Z",
      periodEnd: "2099-10-31T23:59:59.999Z",
      targetAmount: target,
      progressAmount: progress,
      status,
      computedAt: "2026-10-28T00:00:00Z",
    },
    ...over,
  };
}

const show = (g: Goal, extra: Partial<React.ComponentProps<typeof GoalRow>> = {}) =>
  render(
    <ul>
      <GoalRow goal={g} account={account} onViewHistory={() => {}} {...extra} />
    </ul>,
  );

describe("GoalRow", () => {
  afterEach(cleanup);

  it("reads name, then type, account and repeat on one grey line, then the amounts", () => {
    show(goal("BALANCE", "6200.50", "10000", "IN_PROGRESS", { isRecurring: true, recurrenceUnit: "MONTH" }));
    expect(screen.getByRole("heading", { name: "My goal" })).toBeTruthy();
    expect(screen.getByText(/^Balance · Main checking · Monthly/)).toBeTruthy();
    expect(screen.getAllByText("$6,200.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$10,000.00").length).toBeGreaterThan(0);
    // One line of amounts: no "to go" figure beside or under it.
    expect(screen.queryByText(/to go|left|Over limit|Target reached/)).toBeNull();
  });

  it("carries no status label of its own: the group names it", () => {
    show(goal("INCOME", "3240", "3000", "ACHIEVED"));
    expect(screen.queryByText("Achieved")).toBeNull();
    expect(screen.queryByText("In progress")).toBeNull();
    expect(screen.queryByText("Failed")).toBeNull();
  });

  it("fills the ring to the share reached and says the percent inside it", () => {
    show(goal("BALANCE", "6200.50", "10000", "IN_PROGRESS"));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("62");
    expect(screen.getByRole("progressbar").textContent).toContain("62%");
  });

  it("tops out at 100% once the target is passed", () => {
    show(goal("INCOME", "3240", "3000", "ACHIEVED"));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.queryByText("108%")).toBeNull();
  });

  it("turns an expense over its cap red", () => {
    show(goal("EXPENSE", "468.20", "400", "FAILED"));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toContain("over target");
    expect(screen.getByRole("progressbar").className).toContain("text-destructive");
  });

  it("does not turn an income goal red for passing its target", () => {
    show(goal("INCOME", "3240", "3000", "ACHIEVED"));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).not.toContain("over target");
  });

  it("names a yearly recurrence and the time left", () => {
    show(goal("INCOME", "1", "10", "IN_PROGRESS", { isRecurring: true, recurrenceUnit: "YEAR" }));
    expect(screen.getByText(/Yearly · Resets in \d+ days$/)).toBeTruthy();
  });

  it("tells the row's state apart: failed, behind, on track, achieved or cancelled", () => {
    const tone = () => screen.getByRole("listitem").getAttribute("data-tone");
    show(goal("EXPENSE", "468", "400", "FAILED"));
    expect(tone()).toBe("failed");
    cleanup();
    show(goal("INCOME", "3240", "3000", "ACHIEVED"));
    expect(tone()).toBe("achieved");
    cleanup();
    show(goal("BALANCE", "1", "10", "IN_PROGRESS"));
    expect(tone()).toBe("on-track");
    cleanup();
    show(goal("BALANCE", "1", "10", "IN_PROGRESS", { archivedAt: "2026-09-15T00:00:00Z" }), { readOnly: true });
    expect(tone()).toBe("cancelled");
  });

  it("colours the progress amount on failed, behind and achieved goals, and keeps it black otherwise", () => {
    const amountOf = (g: Goal) => {
      const { container } = show(g);
      const cls = container.querySelector(".tabular.font-semibold")!.className;
      cleanup();
      return cls;
    };
    expect(amountOf(goal("EXPENSE", "468", "400", "FAILED"))).toContain("text-destructive");
    expect(amountOf(goal("INCOME", "3240", "3000", "ACHIEVED"))).toContain("var(--primary)_58%,black");
    // Behind: nothing earned with the whole period gone by.
    const behind = goal("INCOME", "0", "1000", "IN_PROGRESS");
    behind.currentInstance = { ...behind.currentInstance!, periodStart: "2020-01-01T00:00:00Z", periodEnd: "2020-12-31T23:59:59Z" };
    expect(amountOf(behind)).toContain("text-warning");
    expect(amountOf(goal("BALANCE", "6200.50", "10000", "IN_PROGRESS"))).not.toMatch(/text-(destructive|warning|orange|primary|success|muted)/);
    expect(
      amountOf(goal("BALANCE", "2100", "5000", "IN_PROGRESS", { archivedAt: "2026-09-15T00:00:00Z" })),
    ).not.toMatch(/text-(destructive|warning|orange|primary|success|muted)/);
  });

  it("keeps the scope sentence for screen readers only, so the account isn't lost", () => {
    show(goal("BALANCE", "1", "10", "IN_PROGRESS"));
    const scope = screen.getByTestId("goal-scope");
    expect(scope.textContent).toBe("Tracks the balance of Main checking");
    expect(scope.className).toContain("sr-only");
  });

  it("offers Edit and Cancel goal on an active goal, and Restore on a cancelled one", async () => {
    const user = (await import("@testing-library/user-event")).default;
    show(goal("BALANCE", "1", "10", "IN_PROGRESS"), { onEdit: () => {}, onStop: () => {} });
    await user.click(screen.getByRole("button", { name: "Actions for My goal" }));
    expect(screen.getByRole("menuitem", { name: "View history" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Cancel goal" })).toBeTruthy();
    cleanup();

    show(goal("BALANCE", "1", "10", "IN_PROGRESS", { archivedAt: "2026-09-15T00:00:00Z" }), {
      readOnly: true,
      onRestore: () => {},
    });
    await user.click(screen.getByRole("button", { name: "Actions for My goal" }));
    expect(screen.getByRole("menuitem", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Cancel goal" })).toBeNull();
  });

  it("shows the menu only on hover or focus where there is a hover", () => {
    show(goal("BALANCE", "1", "10", "IN_PROGRESS"));
    const cls = screen.getByRole("button", { name: "Actions for My goal" }).className;
    expect(cls).toContain("sm:opacity-0");
    expect(cls).toContain("sm:group-hover/row:opacity-100");
    expect(cls).toContain("sm:group-focus-within/row:opacity-100");
    expect(cls).toContain("pointer-coarse:opacity-100");
  });

  it("dates a cancelled goal and drops the time left, with no 'In progress' status", () => {
    show(goal("BALANCE", "2100", "5000", "IN_PROGRESS", { archivedAt: "2026-09-15T00:00:00Z" }), { readOnly: true });
    expect(screen.getByText(/Cancelled Sep 15, 2026$/)).toBeTruthy();
    expect(screen.queryByText(/Resets|Ends in/)).toBeNull();
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
