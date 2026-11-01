// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { accountKeys, userKeys } from "@/lib/query-keys";
import type { Account, User } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: { get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useUser } from "@/hooks/useUser";
import { useAccounts } from "@/hooks/useAccounts";

// The app shell fetches both of these, so a page reading them hydrates with them cached.
const cases = [
  {
    name: "useUser",
    seed: (client: QueryClient) => client.setQueryData(userKeys.me, { id: "u1", email: "a@b.com" } as User),
    Probe: () => {
      const { data, isLoading } = useUser();
      return <p>{isLoading ? "loading" : `signed in as ${data?.email}`}</p>;
    },
    loaded: "signed in as a@b.com",
  },
  {
    name: "useAccounts",
    seed: (client: QueryClient) => client.setQueryData(accountKeys.list("active"), [{ id: "a1", name: "Cash" } as Account]),
    Probe: () => {
      const { data, isLoading } = useAccounts();
      return <p>{isLoading ? "loading" : `accounts: ${data?.map((a) => a.name).join(",")}`}</p>;
    },
    loaded: "accounts: Cash",
  },
];

afterEach(cleanup);

describe.each(cases)("$name while hydrating", ({ seed, Probe, loaded }) => {
  const withClient = (client: QueryClient) => (
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>
  );

  it("reads as loading until hydration is done, even when the data is already cached", async () => {
    // The server has nothing: it is fetched through the browser's session.
    const container = document.createElement("div");
    container.innerHTML = renderToString(withClient(new QueryClient()));
    document.body.appendChild(container);
    expect(container.textContent).toBe("loading");

    // By the time the page hydrates, the app shell has cached it.
    const cached = new QueryClient();
    seed(cached);
    const mismatches: string[] = [];
    const onError = (e: ErrorEvent) => mismatches.push(e.message);
    window.addEventListener("error", onError);
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args) => {
      mismatches.push(String(args[0]));
    });

    await act(async () => {
      render(withClient(cached), { container, hydrate: true });
    });

    window.removeEventListener("error", onError);
    consoleError.mockRestore();
    expect(mismatches.filter((m) => /hydrat/i.test(m))).toEqual([]);
    // And once hydrated, it shows what it has.
    expect(screen.getByText(loaded)).toBeTruthy();
  });

  it("shows the cached data at once in a component a client-side navigation mounts", () => {
    const cached = new QueryClient();
    seed(cached);
    render(withClient(cached));
    expect(screen.getByText(loaded)).toBeTruthy();
  });
});
