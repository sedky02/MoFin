// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalCard } from "@/components/goals/goal-card";
import type { Account, Goal } from "@/lib/types";

const account: Account = {
  id: "a1",
  name: "Main checking",
  type: "BANK",
  currency: "USD",
  createdAt: "",
  updatedAt: "",
} as Account;

const goal = (over: Partial<Goal> = {}, instance: Partial<NonNullable<Goal["currentInstance"]>> = {}): Goal => ({
  id: "g1",
  accountId: "a1",
  categoryId: "c1",
  category: {
    id: "c1",
    name: "Restaurants",
    color: "#e05d2a",
    archivedAt: null,
  },
  name: "Restaurants cap",
  type: "EXPENSE",
  targetAmount: "300",
  isRecurring: true,
  recurrenceUnit: "MONTH",
  periodStart: "2026-11-01T00:00:00Z",
  periodEnd: null,
  createdAt: "",
  updatedAt: "",
  currentInstance: {
    id: "i1",
    goalId: "g1",
    periodStart: "2026-11-01T00:00:00Z",
    periodEnd: "2026-11-30T23:59:59.999Z",
    targetAmount: "300",
    progressAmount: "372.74",
    status: "IN_PROGRESS",
    computedAt: "",
    ...instance,
  },
  ...over,
});

const show = (g: Goal, extra: Partial<React.ComponentProps<typeof GoalCard>> = {}) =>
  render(
    <ul>
      <GoalCard goal={g} account={account} onViewHistory={() => {}} {...extra} />
    </ul>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GoalCard", () => {
  it("leads with what is over the cap, the target line and the real amounts", () => {
    show(goal());
    const card = screen.getByRole("listitem");
    expect(within(card).getByText(/over$/).textContent).toMatch(/\$72\.74 over$/);
    expect(within(card).getByText("of your $300 monthly limit")).toBeTruthy();
    expect(within(card).getByTestId("goal-amounts").textContent).toMatch(/\$372\.74.* \/ .*\$300\.00/);
  });

  it("shows the reason, the category and the time left as badges, in that order", () => {
    show(goal());
    const card = screen.getByRole("listitem");
    const text = card.textContent ?? "";
    expect(text.indexOf("Over limit")).toBeLessThan(text.indexOf("Restaurants", text.indexOf("Over limit")));
    expect(text.indexOf("Restaurants", text.indexOf("Over limit"))).toBeLessThan(text.indexOf("Resets in 23 days"));
  });

  it("says how much is left on a cap that runs ahead of the clock", () => {
    show(
      goal(
        {
          name: "Groceries",
          category: {
            id: "c2",
            name: "Groceries",
            color: null,
            archivedAt: null,
          },
        },
        {
          targetAmount: "450",
          progressAmount: "310",
        },
      ),
    );
    const card = screen.getByRole("listitem");
    expect(within(card).getByText(/left$/).textContent).toMatch(/\$140\.00 left$/);
    expect(within(card).getByText("Spending fast")).toBeTruthy();
  });

  it("names every category when the goal has none", () => {
    show(goal({ categoryId: null, category: null }, { progressAmount: "10" }));
    expect(screen.getByText("All spending")).toBeTruthy();
  });

  it("names the account on a balance goal, with no category", () => {
    show(
      goal(
        {
          type: "BALANCE",
          categoryId: null,
          category: null,
          isRecurring: false,
          recurrenceUnit: null,
          periodEnd: "2026-12-31T23:59:59.999Z",
        },
        {
          targetAmount: "5000",
          progressAmount: "3000",
          periodStart: "2026-09-01T00:00:00Z",
          periodEnd: "2026-12-31T23:59:59.999Z",
        },
      ),
    );
    const card = screen.getByRole("listitem");
    expect(within(card).getByText("Main checking")).toBeTruthy();
    expect(within(card).queryByText("All spending")).toBeNull();
    expect(within(card).getByText("Until Dec 31")).toBeTruthy();
    expect(within(card).getByText("to save $5,000")).toBeTruthy();
    expect(within(card).getByText(/to go$/).textContent).toMatch(/\$2,000\.00 to go$/);
  });

  it("names the account on other goals only when asked", () => {
    show(goal());
    expect(screen.queryByText("Main checking")).toBeNull();
    cleanup();
    show(goal(), { showAccount: true });
    expect(screen.getByText("Main checking")).toBeTruthy();
  });

  it("folds an achieved goal to one line, without a bar", () => {
    show(
      goal(
        { type: "INCOME", name: "Freelance income" },
        { targetAmount: "1000", progressAmount: "1200", status: "ACHIEVED" },
      ),
    );
    const card = screen.getByRole("listitem");
    expect(card.dataset.tone).toBe("achieved");
    expect(within(card).queryByRole("progressbar")).toBeNull();
    expect(within(card).getByText(/above$/).textContent).toMatch(/\$200\.00 above$/);
  });

  it("dates a cancelled goal instead of the time left, and offers Restore", async () => {
    vi.useRealTimers();
    const onRestore = vi.fn();
    show(goal({ archivedAt: "2026-10-12T10:00:00Z" }, { progressAmount: "100" }), { readOnly: true, onRestore });
    const card = screen.getByRole("listitem");
    expect(within(card).getByText(/^Cancelled /)).toBeTruthy();
    expect(within(card).queryByText(/Resets in/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Restaurants cap" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(onRestore).toHaveBeenCalled();
  });

  it("offers Edit and Cancel goal on an active goal", async () => {
    vi.useRealTimers();
    show(goal(), { onEdit: () => {}, onStop: () => {} });
    await userEvent.click(screen.getByRole("button", { name: "Actions for Restaurants cap" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Cancel goal" })).toBeTruthy();
  });
});
