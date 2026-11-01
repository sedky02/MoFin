// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ConnectedAppsCard } from "@/components/settings/connected-apps-card";
import { SaveBar } from "@/components/settings/save-bar";
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

  it("shows the Claude and ChatGPT logos, and a letter for an app it doesn't know", () => {
    appsState = {
      data: [
        { clientId: "c1", clientName: "Claude", scope: "mcp", active: true },
        { clientId: "c2", clientName: "ChatGPT", scope: "mcp", active: true },
        { clientId: "c3", clientName: "Zed", scope: "mcp", active: false },
      ],
    };
    const { container } = render(<ConnectedAppsCard />);
    const rows = Array.from(container.querySelectorAll("li"));
    expect(rows[0].querySelector("svg path")?.getAttribute("d")).toMatch(/^M17\.3041/); // Anthropic mark
    expect(rows[1].querySelector("svg path")?.getAttribute("d")).toMatch(/^M22\.2819/); // OpenAI mark
    expect(rows[2].querySelector("svg")).toBeNull();
    expect(rows[2].textContent).toContain("Z");
    // The logos are decoration: the app's name stays the label, not the logo's <title>.
    expect(rows[0].querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
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
  const tops: Record<string, number> = {};

  function renderWithSections() {
    render(
      <>
        <SettingsNav />
        {SETTINGS_SECTIONS.map((s) => (
          <section key={s.id} id={s.id} tabIndex={-1} />
        ))}
      </>,
    );
    for (const { id } of SETTINGS_SECTIONS) {
      const el = document.getElementById(id)!;
      el.getBoundingClientRect = () => ({ top: tops[id] ?? 0 }) as DOMRect;
      el.scrollIntoView = vi.fn();
    }
    // The nav measured once on mount, before the sections had their positions.
    fireEvent.scroll(window);
  }
  const scrollTo = (values: number[]) => {
    SETTINGS_SECTIONS.forEach((s, i) => (tops[s.id] = values[i]));
    fireEvent.scroll(window);
  };
  const current = () => screen.getAllByRole("link").find((a) => a.getAttribute("aria-current") === "location")?.textContent;

  beforeEach(() => {
    // A page far taller than the viewport, so "at the bottom" is false unless a test says so.
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(5000);
    // Runs the frame at once. It returns 0 because the nav clears its pending-frame id
    // inside the callback, which here runs before the id is handed back.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    scrollTo([300, 800, 1300, 1800, 2200, 2350, 2500]);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("links to every section by its anchor", () => {
    render(<SettingsNav />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(SETTINGS_SECTIONS.map((s) => `#${s.id}`));
  });

  it("highlights the section being read as the page scrolls, down and back up", () => {
    renderWithSections();
    expect(current()).toBe("Profile");
    scrollTo([-400, 100, 600, 1100, 1500, 1650, 1800]);
    expect(current()).toBe("Preferences");
    scrollTo([-1500, -1000, -400, 100, 500, 650, 800]);
    expect(current()).toBe("Connected AI apps");
    scrollTo([-400, 100, 600, 1100, 1500, 1650, 1800]);
    expect(current()).toBe("Preferences");
  });

  it("highlights the last section at the bottom of the page", () => {
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(window.innerHeight + 500);
    Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
    renderWithSections();
    scrollTo([-1500, -1200, -900, -500, 200, 310, 420]);
    expect(current()).toBe("Delete account");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("scrolls to a clicked section, highlights it, and keeps it until the reader scrolls by hand", () => {
    renderWithSections();
    fireEvent.click(screen.getByRole("link", { name: "Data" }));
    expect(document.getElementById("data")!.scrollIntoView).toHaveBeenCalled();
    expect(current()).toBe("Data");
    // The page is still moving towards it: scroll events don't pull the highlight elsewhere.
    scrollTo([-1500, -1200, -900, -500, 300, 450, 600]);
    expect(current()).toBe("Data");
    // The reader takes over.
    fireEvent.wheel(window);
    scrollTo([-1500, -1200, -900, -500, 300, 450, 600]);
    expect(current()).toBe("Connected AI apps");
  });
});

describe("SaveBar", () => {
  afterEach(cleanup);

  it("is fixed to the screen, not sticky inside the form, so it can't be left between cards", () => {
    render(
      <form>
        <SaveBar onDiscard={() => {}} />
      </form>,
    );
    const bar = document.querySelector('[data-slot="save-bar"]')!;
    expect(bar.className).toContain("fixed");
    expect(bar.className).not.toContain("sticky");
    expect(bar.textContent).toContain("You have unsaved changes.");
  });

  it("discards on request and offers Save as a submit button", () => {
    const onDiscard = vi.fn();
    render(
      <form>
        <SaveBar onDiscard={onDiscard} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save changes" }).getAttribute("type")).toBe("submit");
  });
});
