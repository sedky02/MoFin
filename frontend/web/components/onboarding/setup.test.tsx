// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account } from "@/lib/types";

vi.mock("@/components/onboarding/first-account-form", () => ({ FirstAccountForm: () => <form aria-label="Add your first account" /> }));

import { Setup } from "@/components/onboarding/setup";

const account = (over: Partial<Account> = {}) => ({ id: "a1", name: "Main bank account", currency: "TND", ...over }) as Account;

afterEach(cleanup);

describe("Setup", () => {
  it("step 1: greets by first name under one heading, with the account form in the card", () => {
    render(<Setup step="account" accounts={[]} skip={() => {}} name="  Alex Demo " />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Add your first account");
    expect(screen.getByText(/^Welcome to MoFin, Alex\./)).toBeTruthy();
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
    expect(screen.getByRole("form", { name: "Add your first account" })).toBeTruthy();
    // Nothing to skip: the first account is the one thing the rest depends on.
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
  });

  it("works without a name", () => {
    render(<Setup step="account" accounts={[]} skip={() => {}} />);
    expect(screen.getByText(/^Welcome to MoFin\./)).toBeTruthy();
  });

  it("step 2: confirms the account, offers the two ways to record, and can be skipped", async () => {
    const skip = vi.fn();
    render(<Setup step="transaction" accounts={[account()]} skip={skip} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Record your first transaction");
    expect(screen.getByText("Step 2 of 2")).toBeTruthy();
    expect(screen.getByText("Main bank account (TND) is ready.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Add a transaction/ }).getAttribute("href")).toBe("/transactions/new");
    expect(screen.getByRole("link", { name: /Describe it in words/ }).getAttribute("href")).toBe("/drafts");

    await userEvent.setup().click(screen.getByRole("button", { name: "Skip for now" }));
    expect(skip).toHaveBeenCalledTimes(1);
  });

  it("step 2 counts several accounts instead of naming one", () => {
    render(<Setup step="transaction" accounts={[account(), account({ id: "a2" })]} skip={() => {}} />);
    expect(screen.getByText("2 accounts are ready.")).toBeTruthy();
  });

  it("keeps the same frame on both steps: one step bar that fills as it goes, one card", () => {
    const bars = () => document.querySelectorAll("[aria-hidden] > span");
    const filled = () => [...bars()].map((b) => b.className.includes("bg-primary"));

    const { rerender, container } = render(<Setup step="account" accounts={[]} skip={() => {}} />);
    const section = container.querySelector("section");
    expect(filled()).toEqual([true, false]);

    rerender(<Setup step="transaction" accounts={[account()]} skip={() => {}} />);
    expect(filled()).toEqual([true, true]);
    // The same element carries over, so the bar animates instead of being swapped.
    expect(container.querySelector("section")).toBe(section);
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });
});
