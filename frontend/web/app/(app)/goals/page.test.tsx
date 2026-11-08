// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GoalsPage from "./page";
import type { Goal } from "@/lib/types";

const goal = (id: string, name: string, archivedAt: string | null = null, over: Partial<Goal> = {}): Goal => ({
  id,
  accountId: "a1",
  name,
  type: "BALANCE",
  targetAmount: "1000",
  isRecurring: false,
  periodStart: "2026-10-01T00:00:00Z",
  periodEnd: "2026-12-31T23:59:59Z",
  archivedAt,
  createdAt: "",
  updatedAt: "",
  currentInstance: {
    id: id + "i",
    goalId: id,
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-12-31T23:59:59Z",
    targetAmount: "1000",
    progressAmount: "250",
    status: archivedAt ? "IN_PROGRESS" : "IN_PROGRESS",
    computedAt: "",
  },
  ...over,
});

let active: Goal[];
let cancelledGoals: Goal[];
const restore = vi.fn();

vi.mock("@/hooks/useGoals", () => ({
  useGoals: (status: string) => ({
    data: status === "archived" ? cancelledGoals : active,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useArchiveGoal: () => ({ mutateAsync: vi.fn() }),
  useRestoreGoal: () => ({ isPending: false, mutate: restore }),
}));
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({
    data: [{ id: "a1", name: "Main checking", type: "BANK", currency: "USD", createdAt: "", updatedAt: "" }],
  }),
}));
vi.mock("@/components/goals/goal-dialog", () => ({ GoalDialog: () => null }));
vi.mock("@/components/goals/goal-history-dialog", () => ({
  GoalHistoryDialog: ({ goal }: { goal?: Goal }) => (goal ? <div role="dialog">History of {goal.name}</div> : null),
}));

describe("GoalsPage", () => {
  beforeEach(() => {
    active = [goal("g1", "Emergency fund"), goal("g2", "Holiday trip")];
    cancelledGoals = [
      goal("e1", "Old car fund", "2026-09-15T00:00:00Z"),
      goal("e2", "Wedding fund", "2026-10-12T00:00:00Z"),
      goal("e3", "Laptop", "2026-09-02T00:00:00Z"),
    ];
    restore.mockReset();
  });
  afterEach(cleanup);

  it("has no tab control, just a Cancelled button with the count", () => {
    render(<GoalsPage />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancelled (3)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Emergency fund" })).toBeTruthy();
  });

  it("sits beside New goal in the header", () => {
    render(<GoalsPage />);
    const cancelled = screen.getByRole("button", { name: "Cancelled (3)" });
    const created = screen.getAllByRole("button", { name: "New goal" })[0];
    expect(cancelled.parentElement).toBe(created.parentElement);
  });

  it("shows the cancelled goals on their own as a history, newest first, grouped by month", async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelled (3)" }));

    // On their own: the active goals and the Cancelled button are gone.
    expect(screen.queryByRole("heading", { name: "Emergency fund" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Cancelled/ })).toBeNull();

    const months = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(months).toEqual(["October 2026", "September 2026"]);
    const september = screen.getByRole("heading", { name: "September 2026" }).closest("section")!;
    expect(within(september).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Old car fund",
      "Laptop",
    ]);
  });

  it("shows where a cancelled goal stood when it was cancelled, without an 'In progress' badge", async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelled (3)" }));
    const row = screen.getByRole("heading", { name: "Wedding fund" }).closest("li")!;
    expect(within(row).getByText(/Cancelled Oct 12, 2026$/)).toBeTruthy();
    expect(within(row).getAllByText("$250.00").length).toBeGreaterThan(0);
    expect(within(row).getByText(/to go$/).textContent).toMatch(/\$750\.00 to go$/);
    expect(within(row).queryByText("In progress")).toBeNull();
  });

  it("groups the active goals by where they stand, worst first", () => {
    active = [
      goal("g1", "Holiday trip", null, { currentInstance: { ...goal("x", "x").currentInstance!, status: "ACHIEVED", progressAmount: "1200" } }),
      goal("g2", "Spending cap", null, {
        type: "EXPENSE",
        currentInstance: { ...goal("x", "x").currentInstance!, status: "FAILED", progressAmount: "1500" },
      }),
      goal("g3", "Emergency fund", null, { periodEnd: null, currentInstance: { ...goal("x", "x").currentInstance!, periodEnd: "2099-01-01T00:00:00Z" } }),
    ];
    render(<GoalsPage />);
    const groups = screen.getAllByRole("heading", { level: 2 });
    expect(groups.map((h) => h.textContent)).toEqual(["Needs attention · 1", "On track · 1", "Achieved · 1"]);
    const names = (title: string) =>
      within(screen.getByRole("heading", { name: title }).closest("section")!)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent);
    expect(names("Needs attention · 1")).toEqual(["Spending cap"]);
    expect(names("On track · 1")).toEqual(["Emergency fund"]);
    expect(names("Achieved · 1")).toEqual(["Holiday trip"]);
  });

  it("goes back to the active goals", async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelled (3)" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to goals" }));
    expect(screen.getByRole("heading", { name: "Emergency fund" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Wedding fund" })).toBeNull();
  });

  it("restores a cancelled goal and opens its history from the list", async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelled (3)" }));
    await userEvent.click(screen.getByRole("button", { name: "Actions for Wedding fund" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(restore).toHaveBeenCalledWith("e2");

    await userEvent.click(screen.getByRole("button", { name: "Actions for Laptop" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "View history" }));
    expect(screen.getByRole("dialog").textContent).toBe("History of Laptop");
  });

  it("explains an empty history instead of hiding the button", async () => {
    cancelledGoals = [];
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelled" }));
    expect(screen.getByText("No cancelled goals")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to goals" })).toBeTruthy();
  });
});
