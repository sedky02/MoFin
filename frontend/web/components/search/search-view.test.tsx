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

  it("shows the list first, with the filters one button away and closed", () => {
    show();
    const toggle = screen.getByRole("button", { name: /^Filters/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("From date")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Account" })).toBeNull();
    expect(screen.getByText("Whole Foods")).toBeTruthy();
  });

  it("opens and closes the filters", async () => {
    show();
    const toggle = screen.getByRole("button", { name: /^Filters/ });
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("From date")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Account" })).toBeTruthy();
    await userEvent.click(toggle);
    expect(screen.queryByLabelText("From date")).toBeNull();
  });

  it("starts open when the URL already carries filters, and counts them on the button", () => {
    show({ type: "EXPENSE", from: "2026-10-01", minAmount: "5" });
    const toggle = screen.getByRole("button", { name: /^Filters/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // Type, From date, and the amount range (min and max count as one).
    expect(within(toggle).getByLabelText("3 active")).toBeTruthy();
  });

  it("does not count the search text as a panel filter", () => {
    show({ q: "rent" });
    const toggle = screen.getByRole("button", { name: /^Filters/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(toggle).queryByLabelText(/active/)).toBeNull();
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

  it("says how many results there are and which page", () => {
    show();
    expect(screen.getByRole("status").textContent).toBe("57 results, page 1");
  });

  it("says 1 result for a single hit", () => {
    total = 1;
    show();
    expect(screen.getByRole("status").textContent).toBe("1 result, page 1");
  });

  it("clears every filter from inside the open panel", async () => {
    show({ type: "EXPENSE", accountId: "a1" });
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(within(screen.getByRole("button", { name: /^Filters/ })).queryByLabelText(/active/)).toBeNull();
  });
});
