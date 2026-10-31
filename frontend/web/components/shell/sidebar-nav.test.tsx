// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarNav } from "./sidebar-nav";
import { isTypingTarget, useNewTransactionShortcut } from "./new-transaction-shortcut";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";

const push = vi.fn();
let pathname = "/transactions";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push }) }));
vi.mock("@/hooks/useDrafts", () => ({ usePendingDraftCount: () => ({ data: 3 }) }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: { displayName: "Sam Rivers", email: "sam@example.com" } }) }));
const logout = vi.fn();
vi.mock("./user-menu", async (orig) => ({ ...(await orig<typeof import("./user-menu")>()), useSignOut: () => ({ logout, loggingOut: false }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
  pathname = "/transactions";
});

describe("SidebarNav", () => {
  it("groups the menu: Dashboard alone, then Money, then Assistant, with Settings pinned below", () => {
    render(<SidebarNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getAllByRole("link").map((l) => l.textContent?.replace(/\d+ pending|\d+$/, "").trim())).toEqual([
      "Dashboard",
      "Transactions",
      "Accounts",
      "Categories",
      "Goals",
      "Drafts",
      "AI Connector",
    ]);
    expect(within(screen.getByRole("group", { name: "Money" })).getAllByRole("link")).toHaveLength(4);
    expect(within(screen.getByRole("group", { name: "Assistant" })).getAllByRole("link")).toHaveLength(2);
    // Settings sits outside the groups, under them.
    const settings = screen.getByRole("link", { name: "Settings" });
    expect(nav.contains(settings)).toBe(false);
    expect(nav.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And the signed-in account closes the sidebar, under Settings.
    expect(settings.compareDocumentPosition(screen.getByText("Sam Rivers")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no Ledger-first line", () => {
    render(<SidebarNav />);
    expect(screen.queryByText(/Ledger-first/)).toBeNull();
  });

  it("ends with the signed-in account and a Sign out button", async () => {
    render(<SidebarNav />);
    expect(screen.getByText("Sam Rivers")).toBeTruthy();
    expect(screen.getByText("sam@example.com")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalled();
  });

  it("keeps the avatar and Sign out in the collapsed strip", () => {
    render(<SidebarNav collapsed onToggleCollapsed={() => {}} />);
    expect(screen.queryByText("Sam Rivers")).toBeNull();
    expect(screen.getByLabelText("Sam Rivers")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("shows the current page as a soft pill, with no lime rail", () => {
    render(<SidebarNav />);
    const current = screen.getByRole("link", { name: /^Transactions/ });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.className).toContain("bg-sidebar-accent");
    expect(current.querySelector(".bg-primary.w-0\\.5")).toBeNull();
    expect(screen.getByRole("link", { name: /^Goals/ }).className).not.toMatch(/(^| )bg-sidebar-accent( |$)/);
  });

  it("puts the N hint on New transaction", () => {
    render(<SidebarNav />);
    const button = screen.getByRole("link", { name: /^New transaction/ });
    expect(within(button).getByText("N")).toBeTruthy();
  });

  it("has a collapse button beside the logo only where the rail asks for one", () => {
    const { rerender } = render(<SidebarNav />);
    expect(screen.queryByRole("button", { name: "Collapse sidebar" })).toBeNull();
    const toggle = vi.fn();
    rerender(<SidebarNav onToggleCollapsed={toggle} />);
    const button = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(screen.getByRole("link", { name: "MoFin home" }).parentElement!.contains(button)).toBe(true);
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalled();
  });

  it("collapses to icons: names become tooltips, group names become divider lines", () => {
    render(<SidebarNav collapsed onToggleCollapsed={() => {}} />);
    expect(screen.queryByText("Money")).toBeNull();
    expect(screen.queryByText("Assistant")).toBeNull();
    expect(document.querySelectorAll("nav hr")).toHaveLength(2);
    const goals = screen.getByRole("link", { name: "Goals" });
    expect(goals.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
    // The pending count survives as a dot with a screen-reader label.
    expect(within(screen.getByRole("link", { name: "Drafts" })).getByText("3 pending")).toBeTruthy();
  });

  it("shows the count on the Drafts item when expanded", () => {
    render(<SidebarNav />);
    expect(within(screen.getByRole("link", { name: /^Drafts/ })).getByText("3")).toBeTruthy();
  });
});

describe("useSidebarCollapsed", () => {
  it("remembers the choice between visits", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    const first = renderHook(() => useSidebarCollapsed());
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1](true));
    expect(first.result.current[0]).toBe(true);
    expect(store.get("mofin:sidebar-collapsed")).toBe("1");
    first.unmount();
    const second = renderHook(() => useSidebarCollapsed());
    expect(second.result.current[0]).toBe(true);
    act(() => second.result.current[1](false));
    expect(store.get("mofin:sidebar-collapsed")).toBe("0");
    vi.unstubAllGlobals();
  });

  it("still holds for the visit when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    vi.unstubAllGlobals();
  });
});

describe("the N shortcut", () => {
  it("knows when keys are text for the element", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("starts a new transaction on N, but not while typing, with a modifier, or over a dialog", async () => {
    renderHook(() => useNewTransactionShortcut());
    await userEvent.keyboard("n");
    expect(push).toHaveBeenCalledWith("/transactions/new");
    push.mockReset();

    await userEvent.keyboard("{Control>}n{/Control}");
    expect(push).not.toHaveBeenCalled();

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    await userEvent.keyboard("n");
    expect(push).not.toHaveBeenCalled();
    input.remove();

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    await userEvent.keyboard("n");
    expect(push).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("does nothing on the new-transaction page itself", async () => {
    pathname = "/transactions/new";
    renderHook(() => useNewTransactionShortcut());
    await userEvent.keyboard("n");
    expect(push).not.toHaveBeenCalled();
  });
});
