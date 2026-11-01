// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@/lib/types";

const { replace, refresh, post, authDelete, toast } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  post: vi.fn(),
  authDelete: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: { post },
  authApi: { delete: authDelete },
}));
vi.mock("sonner", () => ({ toast }));

import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { DeleteDataCard } from "@/components/settings/delete-data-card";

const user = (over: Partial<User> = {}): User => ({
  id: "u1",
  email: "a@b.com",
  hasPassword: true,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...over,
});

let queryClient: QueryClient;
function renderCard(card: React.ReactNode) {
  return render(<QueryClientProvider client={queryClient}>{card}</QueryClientProvider>);
}

beforeEach(() => {
  queryClient = new QueryClient();
  vi.spyOn(queryClient, "resetQueries").mockResolvedValue();
  vi.spyOn(queryClient, "clear");
  post.mockResolvedValue(undefined);
  authDelete.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("DeleteDataCard", () => {
  it("is not offered to a demo, whose data goes when it ends", () => {
    const { container } = renderCard(<DeleteDataCard user={user({ isDemo: true })} isLoading={false} />);
    expect(container.textContent).toBe("");
  });

  it("asks for the word and nothing else, and deletes nothing until it is typed", async () => {
    const u = userEvent.setup();
    renderCard(<DeleteDataCard user={user()} isLoading={false} />);

    await u.click(screen.getByRole("button", { name: "Delete data…" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete all your data?" });
    expect(dialog.querySelectorAll("input")).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: "Delete data" }));
    expect(await screen.findByText("Type DELETE to confirm.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("deletes the data, refreshes what is cached, says so and closes", async () => {
    const u = userEvent.setup();
    renderCard(<DeleteDataCard user={user({ hasPassword: false })} isLoading={false} />);

    await u.click(screen.getByRole("button", { name: "Delete data…" }));
    await u.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await u.click(screen.getByRole("button", { name: "Delete data" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/users/me/reset-data", { confirm: "DELETE" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("All your data was deleted."));
    expect(queryClient.resetQueries).toHaveBeenCalled();
    // The account stays: no sign-out, no redirect.
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("stays open and says nothing was deleted when the request fails", async () => {
    post.mockRejectedValue(new Error("boom"));
    const u = userEvent.setup();
    renderCard(<DeleteDataCard user={user()} isLoading={false} />);

    await u.click(screen.getByRole("button", { name: "Delete data…" }));
    await u.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await u.click(screen.getByRole("button", { name: "Delete data" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
    expect(queryClient.resetQueries).not.toHaveBeenCalled();
  });
});

describe("DeleteAccountCard", () => {
  it.each([
    ["a password account", true],
    ["a Google-only account", false],
  ])("asks %s for the word only, with no password or email field", async (_label, hasPassword) => {
    const u = userEvent.setup();
    renderCard(<DeleteAccountCard user={user({ hasPassword })} isLoading={false} />);

    await u.click(screen.getByRole("button", { name: "Delete account…" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete your account?" });
    expect(dialog.querySelectorAll("input")).toHaveLength(1);
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByLabelText(/email/i)).toBeNull();

    await u.click(screen.getByRole("button", { name: "Delete account" }));
    expect(await screen.findByText("Type DELETE to confirm.")).toBeTruthy();
    expect(authDelete).not.toHaveBeenCalled();

    await u.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await u.click(screen.getByRole("button", { name: "Delete account" }));

    await waitFor(() => expect(authDelete).toHaveBeenCalledWith("/account", { confirm: "DELETE" }));
    expect(queryClient.clear).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login?reason=account_deleted");
  });

  it("points to Delete data for starting over without leaving", () => {
    renderCard(<DeleteAccountCard user={user()} isLoading={false} />);
    expect(screen.getByText(/stay signed in, use/i)).toBeTruthy();
  });
});
