// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let user: { isDemo?: boolean; email?: string } | undefined;
let apps: { clientId: string; clientName: string | null; scope: string; active: boolean }[] | undefined;

vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: user }) }));
vi.mock("@/hooks/useConnectedApps", () => ({ useConnectedApps: () => ({ data: apps }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

async function renderPage(mcpUrl = "https://api.example.com/api/v1/mcp") {
  vi.stubEnv("NEXT_PUBLIC_MCP_URL", mcpUrl);
  vi.resetModules();
  const { default: ConnectPage } = await import("./page");
  return render(<ConnectPage />);
}

describe("ConnectPage", () => {
  beforeEach(() => {
    user = { isDemo: false, email: "amel@example.com" };
    apps = undefined;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("offers Add to Claude as a link that says it opens a new tab", async () => {
    await renderPage();
    const link = screen.getByRole("link", { name: /Add to Claude/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.textContent).toContain("(opens in a new tab)");
    expect(link.getAttribute("href")).toContain("claude.ai");
  });

  it("makes Add to Claude a real disabled button for a demo user, tied to the explanation", async () => {
    user = { isDemo: true };
    await renderPage();
    expect(screen.queryByRole("link", { name: /Add to Claude/ })).toBeNull();
    const button = screen.getByRole("button", { name: /Add to Claude/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe("connect-unavailable");
    expect(document.getElementById("connect-unavailable")?.textContent).toMatch(/demo/);
  });

  it("disables the ChatGPT button for a demo user too", async () => {
    user = { isDemo: true };
    await renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /ChatGPT/ }));
    expect((screen.getByRole("button", { name: /Open ChatGPT connector settings/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a plain message, not an env var name, when no connector URL is configured", async () => {
    await renderPage("");
    expect(document.body.textContent).not.toContain("NEXT_PUBLIC_MCP_URL");
    expect(screen.getAllByText(/isn't available on this server yet/).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: /Add to Claude/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("marks an app that is already connected and links to where to manage it", async () => {
    apps = [{ clientId: "c1", clientName: "Claude", scope: "mcp", active: true }];
    await renderPage();
    expect(screen.getByText(/Claude is connected to your account/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage in Settings" }).getAttribute("href")).toBe("/settings#connected-apps");
    expect(screen.getByRole("tab", { name: /Claude.*\(connected\)/ })).toBeTruthy();
  });

  it("says when consent was kept but the app is signed out", async () => {
    apps = [{ clientId: "c1", clientName: "Claude", scope: "mcp", active: false }];
    await renderPage();
    expect(screen.getByText(/was approved but isn't signed in right now/)).toBeTruthy();
  });

  it("shows no connected state for an app that isn't the selected client", async () => {
    apps = [{ clientId: "c2", clientName: "ChatGPT", scope: "mcp", active: true }];
    await renderPage();
    expect(screen.queryByText(/is connected to your account/)).toBeNull();
  });

  it("offers the assistants as tabs with visible names, and switches the steps with them", async () => {
    await renderPage();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    // By accessible name: the logos inside are hidden from it.
    for (const name of ["Claude", "ChatGPT", "Gemini", "Other"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Set up Claude" })).toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: "Other" }));
    expect(screen.getByRole("tab", { name: "Other" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Set up another MCP client" })).toBeTruthy();
    expect(screen.getByText("Find the connector option")).toBeTruthy();
  });

  it("shows the connector URL once", async () => {
    await renderPage();
    expect(screen.getAllByDisplayValue("https://api.example.com/api/v1/mcp")).toHaveLength(1);
  });

  it("has no heading inside a button and keeps the heading order h1, h2, h3", async () => {
    await renderPage();
    for (const button of screen.getAllByRole("button")) {
      expect(button.querySelector("h1,h2,h3,h4")).toBeNull();
    }
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  });

  it("links to the Connected AI apps card in Settings", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: /Connected AI apps/ }).getAttribute("href")).toBe("/settings#connected-apps");
  });
});
