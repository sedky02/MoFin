// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftComposer } from "@/components/drafts/draft-composer";

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock("@/hooks/useDrafts", () => ({ useCreateDraftIntent: () => ({ mutateAsync, isPending: false }) }));
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ data: [{ id: "a1", name: "Main checking", type: "BANK", currency: "USD", createdAt: "", updatedAt: "" }] }),
}));
vi.mock("@/hooks/useActiveAccount", () => ({ useActiveAccount: () => ({ accountId: "a1" }) }));

const box = () => screen.getByRole("textbox", { name: "Describe a transaction in plain language" }) as HTMLTextAreaElement;

describe("DraftComposer", () => {
  afterEach(() => {
    cleanup();
    mutateAsync.mockClear();
  });

  it("is one text box, with no separate title or subtitle", () => {
    render(<DraftComposer />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText(/you review before anything is recorded/)).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("keeps the account and Draft it along the bottom edge of the box", () => {
    render(<DraftComposer />);
    const edge = screen.getByRole("button", { name: /^Draft it/ }).parentElement!;
    expect(edge.contains(screen.getByRole("combobox", { name: "Default account" }))).toBe(true);
    expect(edge.parentElement!.contains(box())).toBe(true);
  });

  it("drafts on Ctrl+Enter", async () => {
    render(<DraftComposer />);
    await userEvent.type(box(), "Coffee 4.20");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(mutateAsync).toHaveBeenCalledWith({ input: "Coffee 4.20", defaultAccountId: "a1", defaultCurrency: "USD" });
  });

  it("lists the examples as a return arrow and the sentence, with no chip border", () => {
    render(<DraftComposer />);
    const list = screen.getByRole("list", { name: "Examples" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Spent 42.50 on groceries at the market yesterday",
      "Got paid 3200 salary into my bank account",
      "Moved 500 from checking to savings",
    ]);
    for (const b of buttons) {
      expect(b.querySelector("svg.lucide-corner-down-right")).toBeTruthy();
      expect(b.className).not.toMatch(/\bborder\b|rounded-full/);
    }
  });

  it("fills the box with an example on click, without drafting it", async () => {
    render(<DraftComposer />);
    await userEvent.click(screen.getByRole("button", { name: "Got paid 3200 salary into my bank account" }));
    expect(box().value).toBe("Got paid 3200 salary into my bank account");
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
