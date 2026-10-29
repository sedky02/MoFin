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
let endedGoals: Goal[];
const restore = vi.fn();

vi.mock("@/hooks/useGoals", () => ({
  useGoals: (status: string) => ({
    data: status === "archived" ? endedGoals : active,
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
    endedGoals = [
      goal("e1", "Old car fund", "2026-09-15T00:00:00Z"),
      goal("e2", "Wedding fund", "2026-10-12T00:00:00Z"),
      goal("e3", "Laptop", "2026-09-02T00:00:00Z"),
    ];
    restore.mockReset();
  });
  afterEach(cleanup);

  it("has no tab control, just an Ended button with the count", () => {
    render(<GoalsPage />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("button", { name: "Ended (3)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Emergency fund" })).toBeTruthy();
  });

  it("sits beside New goal in the header", () => {
    render(<GoalsPage />);
    const ended = screen.getByRole("button", { name: "Ended (3)" });
    const created = screen.getAllByRole("button", { name: "New goal" })[0];
    expect(ended.parentElement).toBe(created.parentElement);
  });

  it("shows the ended goals on their own as a history, newest first, grouped by month", async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Ended (3)" }));

    // On their own: the active goals and the Ended button are gone.
    expect(screen.queryByRole("heading", { name: "Emergency fund" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Ended/ })).toBeNull();

    const months = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(months).toEqual(["October 2026", "September 2026"]);
    const september = screen.getByRole("heading", { name: "September 2026" }).closest("section")!;
    expect(within(september).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Old car fund",
      "Laptop",
    ]);
  });

  it("shows where an ended goal stood when it was ended, without an 'In progress' badge", async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Ended (3)" }));
    const row = screen.getByRole("heading", { name: "Wedding fund" }).closest("li")!;
    expect(within(row).getByText(/^Ended /)).toBeTruthy();
    expect(within(row).getAllByText("$250.00").length).toBeGreaterThan(0);
    expect(within(row).getByText("25%")).toBeTruthy();
    expect(within(row).queryByText("In progress")).toBeNull();
  });

  it("goes back to the active goals", async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Ended (3)" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to goals" }));
    expect(screen.getByRole("heading", { name: "Emergency fund" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Wedding fund" })).toBeNull();
  });

  it("restores an ended goal and opens its history from the list", async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Ended (3)" }));
    await userEvent.click(screen.getByRole("button", { name: "Restore Wedding fund" }));
    expect(restore).toHaveBeenCalledWith("e2");

    await userEvent.click(screen.getByRole("button", { name: "View history of Laptop" }));
    expect(screen.getByRole("dialog").textContent).toBe("History of Laptop");
  });

  it("explains an empty history instead of hiding the button", async () => {
    endedGoals = [];
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Ended" }));
    expect(screen.getByText("No ended goals")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to goals" })).toBeTruthy();
  });
});
