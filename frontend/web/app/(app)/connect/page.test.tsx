// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
    fireEvent.click(screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"))[1]);
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
    expect(screen.getAllByText("Connected").length).toBeGreaterThan(0);
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

  it("exposes every client choice as a toggle button with a visible name and no heading inside", async () => {
    await renderPage();
    const picker = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    expect(picker).toHaveLength(4);
    for (const button of picker) {
      expect(button.querySelector("h1,h2,h3,h4")).toBeNull();
    }
    const other = picker[3];
    expect(other.textContent).toContain("Other");
    expect(other.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(other);
    expect(other.getAttribute("aria-pressed")).toBe("true");
    expect(picker[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("links to the Connected AI apps card in Settings", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: /Connected AI apps/ }).getAttribute("href")).toBe("/settings#connected-apps");
  });
});
