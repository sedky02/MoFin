// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalDialog } from "@/components/goals/goal-dialog";
import type { Goal } from "@/lib/types";

vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({
    data: [{ id: "a1", name: "Main checking", type: "BANK", currency: "USD", createdAt: "", updatedAt: "" }],
  }),
}));
vi.mock("@/hooks/useActiveAccount", () => ({ useActiveAccount: () => ({ accountId: "a1" }) }));
vi.mock("@/hooks/useGoals", () => ({
  useCreateGoal: () => ({ mutateAsync: vi.fn() }),
  useUpdateGoal: () => ({ mutateAsync: vi.fn() }),
}));

const existing: Goal = {
  id: "g1",
  accountId: "a1",
  name: "Emergency fund",
  type: "INCOME",
  targetAmount: "3000",
  isRecurring: false,
  periodStart: "2026-10-01T00:00:00Z",
  periodEnd: "2026-12-31T23:59:59Z",
  createdAt: "",
  updatedAt: "",
  currentInstance: null,
};

// Radix's switch and select measure themselves with ResizeObserver, which jsdom doesn't have.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GoalDialog", () => {
  it("puts the cursor in Name, not on the close button", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Name")));
  });

  it("offers the goal types as a radio group, Balance first", () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Goal type" });
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(group.getAttribute("aria-describedby")).toBe("goal-type-hint");
  });

  it("updates the scope line and the rule as the type changes", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    expect(screen.getByTestId("goal-scope").textContent).toBe("Tracks the balance of Main checking");
    await userEvent.click(screen.getByRole("radio", { name: /^Expense/ }));
    expect(screen.getByTestId("goal-scope").textContent).toBe("Counts all expenses from Main checking");
    expect(screen.getByTestId("goal-rule").textContent).toMatch(/Judged when the period ends/);
    await userEvent.click(screen.getByRole("radio", { name: /^Income/ }));
    expect(screen.getByTestId("goal-scope").textContent).toBe("Counts all income into Main checking");
  });

  it("moves between the types with the arrow keys", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    const balance = screen.getByRole("radio", { name: /^Balance/ });
    // The dialog moves focus to Name once it has opened; wait for that before taking focus ourselves.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Name")));
    balance.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /^Income/ }).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /^Income/ }));
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: /^Expense/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("makes only the chosen type a tab stop", () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("freezes the type and the period when editing, leaving name and target", () => {
    render(<GoalDialog open onOpenChange={() => {}} goal={existing} />);
    expect(screen.getByRole("heading", { name: "Edit goal" })).toBeTruthy();
    for (const radio of screen.getAllByRole("radio")) expect((radio as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("radio", { name: /^Income/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByLabelText("Start date")).toBeNull();
    expect(screen.queryByText("Recurring")).toBeNull();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Emergency fund");
  });

  it("asks for the period only when creating, and switches the end date for an interval when recurring", async () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    expect(screen.getByLabelText("End date")).toBeTruthy();
    await userEvent.click(screen.getByRole("switch"));
    expect(screen.queryByLabelText("End date")).toBeNull();
    expect(screen.getByText("Repeats every")).toBeTruthy();
    expect(screen.getByText("First period starts")).toBeTruthy();
  });

  it("shows only the fields, with the explanations kept for screen readers", () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    // Hidden from view, still part of what a screen reader announces.
    expect(screen.getByTestId("goal-rule").closest("#goal-type-hint")?.className).toContain("sr-only");
    expect(screen.getByRole("radiogroup", { name: "Goal type" }).getAttribute("aria-describedby")).toBe("goal-type-hint");
    const visible = document.body.textContent ?? "";
    expect(visible).toContain("Save up"); // each type card keeps its short label
    // Gone from sight: the long rule, the intro line, and the helper lines under Recurring and End date.
    for (const gone of [
      /Saving\? A Balance goal/,
      /Automatically start a new period/,
      /Transactions on this day still count/,
    ]) {
      const hits = Array.from(document.querySelectorAll("*")).filter(
        (el) => el.children.length === 0 && gone.test(el.textContent ?? "") && !el.closest(".sr-only"),
      );
      expect(hits, String(gone)).toHaveLength(0);
    }
    expect(document.querySelector('[data-slot="dialog-description"]')?.className).toContain("sr-only");
  });

  it("keeps each type's one-word hint short enough for a single line", () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    const hints = screen.getAllByRole("radio").map((r) => r.querySelector("span:last-child")!);
    expect(hints.map((h) => h.textContent)).toEqual(["Save up", "Earn more", "Spend less"]);
    // A narrow phone card fits about 14 characters of this size; truncate is the safety net, not the plan.
    for (const hint of hints) {
      expect((hint.textContent ?? "").length).toBeLessThanOrEqual(14);
      expect(hint.className).toContain("truncate");
    }
  });

  it("has no decorative icon beside the title, so the title and close button share the whole header", () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    const header = document.querySelector('[data-slot="dialog-header"]') as HTMLElement;
    expect(header.querySelector("svg:not(button svg)")).toBeNull();
    expect(header.children).toHaveLength(2); // the title block and the close button
    expect(screen.getByRole("heading", { name: "New goal" })).toBeTruthy();
  });

  it("has a close button and a footer that stay in the dialog", () => {
    render(<GoalDialog open onOpenChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create goal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});
