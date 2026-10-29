// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ConnectedAppsCard } from "@/components/settings/connected-apps-card";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ThemeSetting } from "@/components/settings/theme-setting";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

type App = { clientId: string; clientName: string | null; scope: string; active: boolean };
let appsState: { data?: App[]; isLoading?: boolean; isError?: boolean };
const disconnect = vi.fn();

vi.mock("@/hooks/useConnectedApps", () => ({
  useConnectedApps: () => appsState,
  useDisconnectApp: () => ({ mutate: disconnect }),
}));

describe("ConnectedAppsCard", () => {
  beforeEach(() => {
    appsState = { data: [] };
    disconnect.mockReset();
  });
  afterEach(cleanup);

  it("explains how to connect an app when there are none, and links to the Connect page", () => {
    render(<ConnectedAppsCard />);
    expect(screen.getByText(/No apps connected/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect an app" }).getAttribute("href")).toBe("/connect");
  });

  it("lists each app with its state and a Disconnect button named after it", () => {
    appsState = {
      data: [
        { clientId: "c1", clientName: "Claude", scope: "mcp", active: true },
        { clientId: "c2", clientName: null, scope: "mcp", active: false },
      ],
    };
    render(<ConnectedAppsCard />);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Signed out")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect Claude" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect this app" })).toBeTruthy();
    expect(screen.getByText("Unnamed app")).toBeTruthy();
  });

  it("asks before disconnecting, then disconnects that app", () => {
    appsState = { data: [{ clientId: "c1", clientName: "Claude", scope: "mcp", active: true }] };
    render(<ConnectedAppsCard />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Claude" }));
    expect(disconnect).not.toHaveBeenCalled();
    expect(screen.getByText("Disconnect Claude?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect" }).at(-1)!);
    expect(disconnect).toHaveBeenCalledWith("c1");
  });

  it("says when the list can't be loaded", () => {
    appsState = { isError: true };
    render(<ConnectedAppsCard />);
    expect(screen.getByText(/Couldn't load connected apps/)).toBeTruthy();
  });
});

describe("ThemeSetting", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    });
    document.documentElement.className = "";
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("applies the chosen theme at once and shows which one is on", () => {
    render(
      <ThemeProvider>
        <ThemeSetting />
      </ThemeProvider>,
    );
    const light = screen.getByRole("button", { name: "Light" });
    const dark = screen.getByRole("button", { name: "Dark" });
    expect(light.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(dark);
    expect(dark.getAttribute("aria-pressed")).toBe("true");
    expect(light.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("mofin-theme")).toBe("dark");
    fireEvent.click(light);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("SettingsNav", () => {
  afterEach(cleanup);

  it("links to every section by its anchor", () => {
    render(<SettingsNav />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(SETTINGS_SECTIONS.map((s) => `#${s.id}`));
  });

  it("marks the clicked section as the current one", () => {
    render(<SettingsNav />);
    fireEvent.click(screen.getByRole("link", { name: "Security" }));
    expect(screen.getByRole("link", { name: "Security" }).getAttribute("aria-current")).toBe("location");
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("aria-current")).toBeNull();
  });
});
