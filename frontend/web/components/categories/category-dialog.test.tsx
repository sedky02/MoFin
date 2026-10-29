// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryDialog } from "@/components/categories/category-dialog";
import { ApiClientError } from "@/lib/api";

const create = vi.fn();
const update = vi.fn();

vi.mock("@/hooks/useCategories", () => ({
  useCreateCategory: () => ({ mutateAsync: create }),
  useUpdateCategory: () => ({ mutateAsync: update }),
}));

function open(props: Partial<React.ComponentProps<typeof CategoryDialog>> = {}) {
  const onOpenChange = vi.fn();
  render(<CategoryDialog open onOpenChange={onOpenChange} {...props} />);
  return { onOpenChange };
}

describe("CategoryDialog", () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: "new", name: "Gifts", type: "EXPENSE", isSystem: false });
    update.mockReset().mockResolvedValue({});
  });
  afterEach(cleanup);

  it("puts the cursor in the Name field when it opens", async () => {
    open();
    const name = screen.getByLabelText("Name");
    await waitFor(() => expect(document.activeElement).toBe(name));
  });

  it("asks for a name before creating anything", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "Create category" }));
    expect(await screen.findByText("Give the category a name.")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("explains a name that is too long", async () => {
    open();
    await userEvent.type(screen.getByLabelText("Name"), "x".repeat(45));
    await userEvent.click(screen.getByRole("button", { name: "Create category" }));
    expect(await screen.findByText("Keep it under 40 characters.")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("creates the category with the chosen type, emoji and colour", async () => {
    const onCreated = vi.fn();
    const { onOpenChange } = open({ onCreated });
    await userEvent.type(screen.getByLabelText("Name"), "Pay");
    await userEvent.click(screen.getByRole("button", { name: "Income" }));
    await userEvent.click(screen.getByRole("button", { name: "Salary" }));
    await userEvent.click(screen.getByRole("button", { name: "Create category" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({ name: "Pay", type: "INCOME", color: expect.any(String), icon: "salary" });
    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("leaves the icon out when it is chosen from the name", async () => {
    open();
    await userEvent.type(screen.getByLabelText("Name"), "Rent");
    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    await userEvent.click(screen.getByRole("button", { name: "Choose from the name" }));
    await userEvent.click(screen.getByRole("button", { name: "Create category" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].icon).toBeUndefined();
  });

  it("shows line icons, not emoji, and marks the chosen one", async () => {
    open();
    const group = screen.getByRole("group", { name: "Icon" });
    expect(group.querySelectorAll("button svg").length).toBe(14);
    expect(group.textContent).toBe("");
    const home = screen.getByRole("button", { name: "Home" });
    expect(home.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(home);
    expect(home.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Choose from the name" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a taken name on the Name field instead of a database message", async () => {
    create.mockRejectedValue(new ApiClientError(409, "A record with this userId, name, type already exists"));
    const { onOpenChange } = open();
    await userEvent.type(screen.getByLabelText("Name"), "Groceries");
    await userEvent.click(screen.getByRole("button", { name: "Create category" }));

    expect(await screen.findByText("You already have an expense category called “Groceries”.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("userId");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Name")));
  });

  it("edits an existing category without offering to change its type", async () => {
    open({
      category: { id: "c1", name: "Rent", type: "EXPENSE", color: "#0ea5e9", icon: "🏠", isSystem: false },
    });
    expect(screen.queryByRole("button", { name: "Income" })).toBeNull();
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    expect(name.value).toBe("Rent");
    await userEvent.clear(name);
    await userEvent.type(name, "Housing");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: "c1", name: "Housing", color: "#0ea5e9", icon: "🏠" }));
  });

  it("starts with two rows of icons and expands to all of them, then back", async () => {
    open();
    const group = screen.getByRole("group", { name: "Icon" });
    const toggle = screen.getByRole("button", { name: /Show all \d+ icons/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(group.querySelectorAll("button").length).toBe(14);

    await userEvent.click(toggle);
    expect(group.querySelectorAll("button").length).toBeGreaterThan(14);
    const fewer = screen.getByRole("button", { name: "Show fewer icons" });
    expect(fewer.getAttribute("aria-expanded")).toBe("true");

    await userEvent.click(fewer);
    expect(group.querySelectorAll("button").length).toBe(14);
  });

  it("shows a single row of icons on a phone, so the dialog fits the screen, and still expands", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 639px)",
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    try {
      open();
      const group = screen.getByRole("group", { name: "Icon" });
      expect(group.querySelectorAll("button").length).toBe(7);
      await userEvent.click(screen.getByRole("button", { name: /Show all \d+ icons/ }));
      expect(group.querySelectorAll("button").length).toBeGreaterThan(14);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a chosen icon in view when the list is collapsed", async () => {
    // "Bank" sits past the first two rows for an expense.
    open({ category: { id: "c1", name: "Fees", type: "EXPENSE", color: "#0ea5e9", icon: "bank", isSystem: false } });
    expect(screen.getByRole("button", { name: "Bank" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("group", { name: "Icon" }).querySelectorAll("button").length).toBe(14);
  });

  it("leads with income icons when the category is an income", async () => {
    open({ defaultType: "INCOME" });
    const first = screen.getByRole("group", { name: "Icon" }).querySelector("button");
    expect(first?.getAttribute("aria-label")).toBe("Salary");
  });

  it("keeps an emoji saved by an older version when the category is edited", async () => {
    open({ category: { id: "c1", name: "Dining", type: "EXPENSE", color: "#f97316", icon: "🍔", isSystem: false } });
    // The kept emoji takes one of the two rows, so the grid still ends on a full row.
    expect(screen.getByRole("group", { name: "Icon" }).querySelectorAll("button").length).toBe(14);
    expect(screen.getByRole("button", { name: "Keep 🍔" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: "c1", name: "Dining", color: "#f97316", icon: "🍔" }));
  });

  it("starts on the type the transaction being entered needs", () => {
    open({ defaultType: "INCOME" });
    expect(screen.getByRole("button", { name: "Income" }).getAttribute("aria-pressed")).toBe("true");
  });
});
