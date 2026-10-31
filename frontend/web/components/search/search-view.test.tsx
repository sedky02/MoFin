// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchView, type SearchInitial } from "@/components/search/search-view";
import type { Transaction } from "@/lib/types";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/transactions",
}));
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ data: [{ id: "a1", name: "Main checking", type: "BANK", currency: "USD", createdAt: "", updatedAt: "" }] }),
}));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => ({ data: [] }) }));

let rows: Transaction[] = [];
let total = 0;
vi.mock("@/hooks/useSearch", () => ({
  useSearchPage: () => ({
    data: { rows, hasNext: false, total },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const at = (day: number) => new Date(2026, 9, day, 12).toISOString();
function tx(id: string, description: string, day: number, over: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: "EXPENSE",
    description,
    currency: "USD",
    occurredAt: at(day),
    category: null,
    items: [
      {
        id: id + "i",
        transactionId: id,
        accountId: "a1",
        account: { id: "a1", name: "Main checking", type: "BANK", currency: "USD", createdAt: "", updatedAt: "" },
        direction: "DEBIT",
        amount: "10.00",
        currency: "USD",
      },
    ],
    createdAt: "",
    updatedAt: "",
    isRecurring: false,
    ...over,
  };
}

const show = (initial: SearchInitial = {}) => render(<SearchView initial={initial} />);

describe("SearchView", () => {
  beforeEach(() => {
    rows = [tx("1", "Whole Foods", 28), tx("2", "Salary", 27), tx("3", "Rent", 27)];
    total = 57;
    replace.mockReset();
  });
  afterEach(cleanup);

  it("keeps search, account and category always in reach, and the rest behind More filters", () => {
    show();
    expect(screen.getByRole("textbox", { name: "Search transactions" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Category" })).toBeTruthy();
    const toggle = screen.getByRole("button", { name: /^More filters/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("From date")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Sort by" })).toBeNull();
    expect(screen.getByText("Whole Foods")).toBeTruthy();
  });

  it("opens and closes More filters", async () => {
    show();
    const toggle = screen.getByRole("button", { name: /^More filters/ });
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("From date")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Recurring" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toBeTruthy();
    await userEvent.click(toggle);
    expect(screen.queryByLabelText("From date")).toBeNull();
  });

  it("starts open when the URL already carries more filters, and counts them on the button", () => {
    show({ type: "EXPENSE", from: "2026-10-01", to: "2026-10-31", minAmount: "5", sort: "oldest" });
    const toggle = screen.getByRole("button", { name: /^More filters/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // Type, the date range, the amount range and the sort order: each counts once.
    expect(within(toggle).getByLabelText("4 active")).toBeTruthy();
  });

  it("does not count search, account or category on the More filters button", () => {
    show({ q: "rent", accountId: "a1" });
    const toggle = screen.getByRole("button", { name: /^More filters/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(toggle).queryByLabelText(/active/)).toBeNull();
  });

  it("shows each active filter as a chip that removes itself, with Clear all", async () => {
    show({ type: "EXPENSE", accountId: "a1", from: "2026-10-01", to: "2026-10-31" });
    const chips = within(screen.getByRole("group", { name: "Active filters" }));
    expect(chips.getByRole("button", { name: "Remove filter: Main checking" })).toBeTruthy();
    expect(chips.getByRole("button", { name: "Remove filter: Expense" })).toBeTruthy();
    expect(chips.getByRole("button", { name: /^Remove filter: Oct 1, 2026 – Oct 31, 2026/ })).toBeTruthy();

    await userEvent.click(chips.getByRole("button", { name: "Remove filter: Expense" }));
    expect(chips.queryByRole("button", { name: "Remove filter: Expense" })).toBeNull();
    expect(chips.getByRole("button", { name: "Remove filter: Main checking" })).toBeTruthy();

    await userEvent.click(chips.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByRole("group", { name: "Active filters" })).toBeNull();
  });

  it("shows no chips while nothing is filtered", () => {
    show();
    expect(screen.queryByRole("group", { name: "Active filters" })).toBeNull();
  });

  it("groups a date-sorted list by day, newest first, with the day above its rows", () => {
    show();
    const sections = screen.getAllByRole("region");
    expect(sections).toHaveLength(2);
    expect(within(sections[0]).getByRole("heading", { level: 2 }).textContent).toMatch(/Oct 28|Yesterday|Today/);
    expect(within(sections[1]).getAllByRole("link").map((l) => l.textContent)).toEqual([
      expect.stringContaining("Salary"),
      expect.stringContaining("Rent"),
    ]);
  });

  it("leaves the date off rows that sit under a day heading", () => {
    show();
    const row = screen.getByText("Whole Foods").closest("a")!;
    expect(row.textContent).not.toMatch(/\b2026\b/);
  });

  it("keeps a date on every row when sorted by amount, since the days jump around", () => {
    show({ sort: "amount-desc" });
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    const row = screen.getByText("Whole Foods").closest("a")!;
    expect(row.textContent).toMatch(/2026/);
  });

  it("shows the range on this page out of the total, next to Per page and the page buttons", () => {
    show();
    expect(screen.getByRole("status").textContent).toBe("1–3 of 57");
    expect(screen.getByRole("combobox", { name: "Per page" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("says 1 of 1 for a single hit", () => {
    rows = [tx("1", "Whole Foods", 28)];
    total = 1;
    show();
    expect(screen.getByRole("status").textContent).toBe("1 of 1");
  });

  it("shows no running total on a day heading", () => {
    show();
    const section = screen.getAllByRole("region")[1];
    expect(within(section).queryByLabelText("Net for the day")).toBeNull();
    expect(section.querySelector("h2")!.parentElement!.firstElementChild).toBe(section.querySelector("h2"));
  });

  it("explains an empty result when filters are on, and clears them from the button", async () => {
    rows = [];
    total = 0;
    show({ type: "EXPENSE" });
    expect(screen.getByText("No transactions match")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByRole("group", { name: "Active filters" })).toBeNull();
  });
});
