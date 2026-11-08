// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalDialog } from "@/components/goals/goal-dialog";
import type { Goal } from "@/lib/types";

const create = vi.fn();
const update = vi.fn();

vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({
    data: [
      {
        id: "a1",
        name: "Main checking",
        type: "BANK",
        currency: "USD",
        createdAt: "",
        updatedAt: "",
      },
    ],
  }),
}));
vi.mock("@/hooks/useActiveAccount", () => ({
  useActiveAccount: () => ({ accountId: "a1" }),
}));
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    data: [
      {
        id: "c1",
        name: "Restaurants",
        type: "EXPENSE",
        color: "#e05d2a",
        isSystem: false,
      },
      {
        id: "c2",
        name: "Freelance",
        type: "INCOME",
        color: "#2e5bff",
        isSystem: false,
      },
    ],
  }),
}));
vi.mock("@/hooks/useGoals", () => ({
  useCreateGoal: () => ({ mutateAsync: create }),
  useUpdateGoal: () => ({ mutateAsync: update }),
}));

const existing: Goal = {
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
  currentInstance: null,
};

// Radix's select measures itself with ResizeObserver, which jsdom doesn't have.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  create.mockReset();
  update.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const labelsInOrder = () =>
  Array.from(screen.getByRole("dialog").querySelectorAll("label:not(.sr-only)")).map((l) => l.textContent);

describe("GoalDialog", () => {
  it("starts with only the three goal choices, focused on the first", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    expect(screen.getByRole("heading", { name: "What's this goal for?" })).toBeTruthy();
    const choices = within(screen.getByRole("list")).getAllByRole("button");
    expect(choices.map((c) => c.textContent)).toEqual([
      "Save upGrow an account to an amount",
      "Earn moreReach an income target",
      "Spend lessStay under a spending limit",
    ]);
    expect(screen.queryByRole("textbox")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(choices[0]));
  });

  it("labels each Spend less field plainly and moves the cursor to the amount", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Spend less/ }));
    expect(screen.getByRole("heading", { name: "Spend less" })).toBeTruthy();
    expect(labelsInOrder()).toEqual([
      "Spending limit",
      "Spending category",
      "Account you pay from",
      "Repeats",
      "Goal name",
    ]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Spending limit")));
  });

  it("asks no category for Save up", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Save up/ }));
    expect(labelsInOrder()).toEqual(["Amount to save", "Account you save in", "Repeats", "Goal name"]);
  });

  it("counts every category by default and suggests a name from the choice", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Earn more/ }));
    expect(screen.getByRole("combobox", { name: "Income category" }).textContent).toContain("All income");
    expect((screen.getByLabelText("Goal name") as HTMLInputElement).value).toBe("Income target");
  });

  it("goes back to the choices without closing", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Spend less/ }));
    await userEvent.click(screen.getByRole("button", { name: "Back to goal types" }));
    expect(screen.getByRole("heading", { name: "What's this goal for?" })).toBeTruthy();
  });

  it("keeps the rules in a tip beside the category", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Spend less/ }));
    await userEvent.hover(screen.getByRole("button", { name: "What counts" }));
    expect((await screen.findAllByText(/Transfers don't count/)).length).toBeGreaterThan(0);
  });

  it("creates a monthly cap on all spending", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Spend less/ }));
    await userEvent.type(screen.getByLabelText("Spending limit"), "300");
    await userEvent.click(screen.getByRole("button", { name: "Create goal" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      accountId: "a1",
      name: "Spend under $300 a month",
      type: "EXPENSE",
      categoryId: null,
      targetAmount: "300.00",
      isRecurring: true,
      recurrenceUnit: "MONTH",
    });
  });

  it("writes the name from the amount and type, then keeps what the user types", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Spend less/ }));
    const nameInput = screen.getByLabelText("Goal name") as HTMLInputElement;
    expect(nameInput.value).toBe("Spending limit");
    await userEvent.type(screen.getByLabelText("Spending limit"), "300");
    expect(nameInput.value).toBe("Spend under $300 a month");

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Eating out");
    await userEvent.type(screen.getByLabelText("Spending limit"), "0");
    expect(nameInput.value).toBe("Eating out");
  });

  it("keeps Create goal apart from the name, beside Cancel", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Spend less/ }));
    const create = screen.getByRole("button", { name: "Create goal" });
    expect(create.parentElement).toBe(screen.getByRole("button", { name: "Cancel" }).parentElement);
    expect(create.parentElement!.contains(screen.getByLabelText("Goal name"))).toBe(false);
  });

  it("opens an edit on the details, with the frozen parts as plain text", () => {
    render(<GoalDialog open onOpenChange={() => {}} goal={existing} />);
    expect(screen.getByRole("heading", { name: "Edit · Spend less" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to goal types" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Restaurants");
    expect(dialog.textContent).toContain("Main checking");
    expect(dialog.textContent).toContain("Every month");
    expect(screen.getByLabelText("Spending limit")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });
});
