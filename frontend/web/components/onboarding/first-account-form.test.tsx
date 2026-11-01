// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { accountKeys, searchKeys } from "@/lib/query-keys";
import type { Account } from "@/lib/types";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/hooks/useAccounts", () => ({ useCreateAccount: () => ({ mutateAsync }) }));
vi.mock("@/lib/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/onboarding")>()),
  guessCurrency: () => "TND",
}));

import { FirstAccountForm } from "@/components/onboarding/first-account-form";

let client: QueryClient;
const renderForm = () =>
  render(
    <QueryClientProvider client={client}>
      <FirstAccountForm />
    </QueryClientProvider>,
  );
const name = () => screen.getByLabelText("Name") as HTMLInputElement;
const type = (label: string) => screen.getByRole("button", { name: label });

beforeEach(() => {
  client = new QueryClient();
  mutateAsync.mockResolvedValue({ id: "a1", name: "Main bank account", type: "BANK", currency: "TND" } as Account);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FirstAccountForm", () => {
  it("starts with everything filled in: a bank account, a name for it, and the device's currency, said so", () => {
    renderForm();
    expect(type("Bank").getAttribute("aria-pressed")).toBe("true");
    expect(name().value).toBe("Main bank account");
    expect(screen.getByRole("combobox", { name: /currency/i }).textContent).toContain("TND");
    expect(screen.getByText(/Picked from where your device is\. It can't be changed later\./)).toBeTruthy();
  });

  it("renames the account with its type until the name is edited by hand", async () => {
    const u = userEvent.setup();
    renderForm();

    await u.click(type("Cash"));
    expect(name().value).toBe("Cash wallet");

    await u.clear(name());
    await u.type(name(), "Pocket money");
    await u.click(type("Savings"));
    expect(name().value).toBe("Pocket money");
  });

  it("creates the account with what is on screen, leaves the balance out when blank, and shows the dashboard at once", async () => {
    const u = userEvent.setup();
    renderForm();

    await u.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ name: "Main bank account", type: "BANK", currency: "TND" }),
    );
    // The list the dashboard reads has the account before it is fetched again.
    await waitFor(() => expect(client.getQueryData<Account[]>(accountKeys.list("active"))).toHaveLength(1));
    // Nobody with no account has transactions, so the next step doesn't wait to find out.
    expect(client.getQueryData(searchKeys.list({ recent: 15, accountId: undefined }))).toEqual([]);
    // And a second tap can't create it twice.
    const done = await screen.findByRole("button", { name: "Setting up your dashboard…" });
    expect((done as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends a balance typed in, rounded to the currency", async () => {
    const u = userEvent.setup();
    renderForm();

    await u.type(screen.getByLabelText(/Balance today/), "1,250.5");
    await u.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ currency: "TND", openingBalance: "1250.500" });
  });

  it("asks for a name instead of creating a nameless account, and stays editable when it fails", async () => {
    const u = userEvent.setup();
    renderForm();

    await u.clear(name());
    await u.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Name is required.")).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();

    mutateAsync.mockRejectedValueOnce(new Error("boom"));
    await u.type(name(), "Wallet");
    await u.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
    expect(client.getQueryData(accountKeys.list("active"))).toBeUndefined();
  });
});
