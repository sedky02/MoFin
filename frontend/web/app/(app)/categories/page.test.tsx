// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoriesPage from "./page";
import type { Category } from "@/lib/types";

const cat = (id: string, name: string, type: "INCOME" | "EXPENSE", isSystem = false): Category => ({
  id,
  name,
  type,
  isSystem,
  color: "#22c55e",
  icon: null,
});

let active: Category[];
let archived: Category[];
const restore = vi.fn();
const archive = vi.fn();

vi.mock("@/hooks/useCategories", () => ({
  useCategories: (status: string) => ({
    data: status === "archived" ? archived : active,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useArchiveCategory: () => ({ isPending: false, mutate: archive }),
  useRestoreCategory: () => ({ isPending: false, mutate: restore }),
}));
vi.mock("@/components/categories/category-dialog", () => ({ CategoryDialog: () => null }));

describe("CategoriesPage", () => {
  beforeEach(() => {
    active = [
      cat("1", "Groceries", "EXPENSE"),
      cat("2", "Rent", "EXPENSE"),
      cat("3", "Salary", "INCOME"),
      cat("4", "Utilities", "EXPENSE", true),
    ];
    archived = [cat("a1", "Gym", "EXPENSE")];
    restore.mockReset();
    archive.mockReset();
  });
  afterEach(cleanup);

  it("groups categories by type instead of repeating the type on each one", () => {
    render(<CategoriesPage />);
    const expenses = screen.getByRole("heading", { name: "Expenses" }).closest('[data-slot="card"]') as HTMLElement;
    const income = screen.getByRole("heading", { name: "Income" }).closest('[data-slot="card"]') as HTMLElement;
    expect(within(expenses).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Groceries"),
      expect.stringContaining("Rent"),
      expect.stringContaining("Utilities"),
    ]);
    expect(within(income).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Expense")).toBeNull();
  });

  it("marks a system category as read-only, with no edit or delete", () => {
    render(<CategoriesPage />);
    expect(screen.getByRole("img", { name: "System category (read-only)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Utilities" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive Utilities" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Groceries" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive Groceries" })).toBeTruthy();
  });

  it("offers no way to delete a category, only to archive it", () => {
    render(<CategoriesPage />);
    expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
    expect(screen.getByRole("button", { name: "Archive Groceries" })).toBeTruthy();
  });

  it("styles the archive button red, like a destructive action", () => {
    render(<CategoriesPage />);
    const button = screen.getByRole("button", { name: "Archive Groceries" });
    expect(button.className).toContain("text-destructive");
    expect(button.className).toContain("hover:bg-destructive/10");
  });

  it("asks before archiving, and archives only when confirmed", async () => {
    render(<CategoriesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Archive Groceries" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText('Archive "Groceries"?')).toBeTruthy();
    expect(within(dialog).getByText(/stay on past transactions/)).toBeTruthy();
    expect(archive).not.toHaveBeenCalled();

    // The confirm button is red too.
    const confirm = within(dialog).getByRole("button", { name: "Archive" });
    expect(confirm.className).toContain("bg-destructive");
    await userEvent.click(confirm);
    expect(archive).toHaveBeenCalledWith("1");
  });

  it("does nothing when the confirmation is cancelled", async () => {
    render(<CategoriesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Archive Rent" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(archive).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("only offers the filter once the list is long enough to need it, then narrows the list", async () => {
    render(<CategoriesPage />);
    expect(screen.queryByRole("searchbox", { name: "Filter categories" })).toBeNull();
    cleanup();

    active = [...active, cat("5", "Dining out", "EXPENSE"), cat("6", "Transport", "EXPENSE"), cat("7", "Gifts", "EXPENSE")];
    render(<CategoriesPage />);
    const filter = screen.getByRole("searchbox", { name: "Filter categories" });
    await userEvent.type(filter, "ren");
    expect(screen.getByText("Rent")).toBeTruthy();
    expect(screen.queryByText("Groceries")).toBeNull();
    // A group with nothing left is dropped.
    expect(screen.queryByRole("heading", { name: "Income" })).toBeNull();

    await userEvent.clear(filter);
    await userEvent.type(filter, "zzz");
    expect(screen.getByText(/No categories match/)).toBeTruthy();
  });

  it("has no tab control, just a button to the archived list", () => {
    render(<CategoriesPage />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("button", { name: "Archived (1)" })).toBeTruthy();
  });

  it("shows the archived categories on their own, then goes back to the active ones", async () => {
    render(<CategoriesPage />);
    expect(screen.queryByText("Gym")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Archived (1)" }));
    expect(screen.getByRole("heading", { name: "Archived" })).toBeTruthy();
    expect(screen.getByText("Gym")).toBeTruthy();
    // On its own: the active lists and the Archived button are gone.
    expect(screen.queryByRole("heading", { name: "Expenses" })).toBeNull();
    expect(screen.queryByText("Groceries")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Archived/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Back to categories" }));
    expect(screen.getByRole("heading", { name: "Expenses" })).toBeTruthy();
    expect(screen.queryByText("Gym")).toBeNull();
  });

  it("explains an empty archive instead of hiding the button", async () => {
    archived = [];
    render(<CategoriesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Archived" }));
    expect(screen.getByText("No archived categories")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to categories" })).toBeTruthy();
  });

  it("restores an archived category from the archived list", async () => {
    render(<CategoriesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Archived (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Restore Gym" }));
    expect(restore).toHaveBeenCalledWith("a1");
  });
});
