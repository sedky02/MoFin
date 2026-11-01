// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@/lib/types";

type Query<T> = { data: T | undefined };
const state = vi.hoisted(() => ({
  user: { data: undefined } as Query<unknown>,
  accounts: { data: undefined } as Query<unknown[]>,
  transactions: { data: undefined } as Query<unknown[]>,
  apps: { data: undefined } as Query<unknown[]>,
  transactionsEnabled: undefined as boolean | undefined,
  appsEnabled: undefined as boolean | undefined,
}));
vi.mock("@/hooks/useUser", () => ({ useUser: () => state.user }));
vi.mock("@/hooks/useAccounts", () => ({ useAccounts: () => state.accounts }));
vi.mock("@/hooks/useSearch", () => ({
  useRecentTransactions: (_limit: number, _account: unknown, enabled: boolean) => {
    state.transactionsEnabled = enabled;
    return state.transactions;
  },
}));
vi.mock("@/hooks/useConnectedApps", () => ({
  useConnectedApps: (enabled: boolean) => {
    state.appsEnabled = enabled;
    return state.apps;
  },
}));

import { useAssistantNudge, useSetup } from "@/hooks/useSetup";

const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
const user = (over: Partial<User> = {}) => ({ id: "u1", email: "a@b.com", createdAt: recent, ...over }) as User;

function setup(over: { user?: User; accounts?: unknown[]; transactions?: unknown[]; apps?: unknown[] } = {}) {
  state.user = { data: over.user ?? user() };
  state.accounts = { data: over.accounts ?? [] };
  state.transactions = { data: "transactions" in over ? over.transactions : [] };
  state.apps = { data: "apps" in over ? over.apps : [] };
}

function Status() {
  const s = useSetup();
  return <p>{s.status === "step" ? `step:${s.step}` : s.status}</p>;
}
function Nudge({ over }: { over: boolean }) {
  const n = useAssistantNudge(over);
  return (
    <>
      <p>{n.show ? "nudge" : "no nudge"}</p>
      <button onClick={n.close}>close</button>
    </>
  );
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  setup();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useSetup", () => {
  it("starts with the first account, and never asks about transactions before there is one", () => {
    setup({ accounts: [] });
    render(<Status />);
    expect(screen.getByText("step:account")).toBeTruthy();
    expect(state.transactionsEnabled).toBe(false);
  });

  it("moves on to the first transaction once there is an account", () => {
    setup({ accounts: [{ id: "a1" }], transactions: [] });
    render(<Status />);
    expect(screen.getByText("step:transaction")).toBeTruthy();
    expect(state.transactionsEnabled).toBe(true);
  });

  it("waits, rather than flashing the dashboard, while it learns whether anything is recorded", () => {
    setup({ accounts: [{ id: "a1" }], transactions: undefined });
    render(<Status />);
    expect(screen.getByText("loading")).toBeTruthy();
  });

  it("is over once something is recorded, however it got there", () => {
    setup({ accounts: [{ id: "a1" }], transactions: [{ id: "t1" }] });
    render(<Status />);
    expect(screen.getByText("off")).toBeTruthy();
  });

  it("stays out of the way while accounts load, and for a demo", () => {
    state.accounts = { data: undefined };
    const { rerender } = render(<Status />);
    expect(screen.getByText("off")).toBeTruthy();

    setup({ user: user({ isDemo: true }), accounts: [] });
    rerender(<Status />);
    expect(screen.getByText("off")).toBeTruthy();
  });

  it("remembers a skipped first transaction, and does not ask again", async () => {
    setup({ accounts: [{ id: "a1" }], transactions: [] });
    function Skippable() {
      const s = useSetup();
      return s.status === "step" ? <button onClick={s.skip}>skip</button> : <p>{s.status}</p>;
    }
    const { unmount } = render(<Skippable />);
    await userEvent.setup().click(screen.getByRole("button", { name: "skip" }));
    expect(screen.getByText("off")).toBeTruthy();

    unmount();
    render(<Status />);
    expect(screen.getByText("off")).toBeTruthy();
    expect(state.transactionsEnabled).toBe(false);
  });

  it("does not skip the first account, whatever was skipped before", () => {
    localStorage.setItem("mofin-setup-skipped", "1");
    setup({ accounts: [] });
    render(<Status />);
    expect(screen.getByText("step:account")).toBeTruthy();
  });
});

describe("useAssistantNudge", () => {
  it("shows to a recent user once setup is over, and no sooner", () => {
    const { rerender } = render(<Nudge over={false} />);
    expect(screen.getByText("no nudge")).toBeTruthy();
    expect(state.appsEnabled).toBe(false);

    rerender(<Nudge over />);
    expect(screen.getByText("nudge")).toBeTruthy();
    expect(state.appsEnabled).toBe(true);
  });

  it("is not shown once an assistant is connected, for a demo, or while the apps load", () => {
    setup({ apps: [{ clientId: "claude" }] });
    const { rerender } = render(<Nudge over />);
    expect(screen.getByText("no nudge")).toBeTruthy();

    setup({ user: user({ isDemo: true }) });
    rerender(<Nudge over />);
    expect(screen.getByText("no nudge")).toBeTruthy();

    setup({ apps: undefined });
    rerender(<Nudge over />);
    expect(screen.getByText("no nudge")).toBeTruthy();
  });

  it("closes for good", async () => {
    const { unmount } = render(<Nudge over />);
    await userEvent.setup().click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByText("no nudge")).toBeTruthy();

    unmount();
    render(<Nudge over />);
    expect(screen.getByText("no nudge")).toBeTruthy();
  });
});
