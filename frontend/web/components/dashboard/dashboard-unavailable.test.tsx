// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DashboardUnavailable } from "@/components/dashboard/dashboard-unavailable";

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe("DashboardUnavailable", () => {
  it("unauthorized: says the session expired and links to sign in", () => {
    render(<DashboardUnavailable kind="unauthorized" />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Your session expired. Sign in again to see your dashboard.",
    );
    expect(screen.getByRole("heading")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/login?next=%2Fdashboard&reason=expired");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it.each([
    ["server", "MoFin's server had a problem loading your dashboard."],
    ["timeout", "MoFin is taking too long to respond."],
    ["unreachable", "Can't reach MoFin right now. Check your connection and try again."],
  ] as const)("%s: shows its copy and a Retry that refreshes the route", async (kind, text) => {
    render(<DashboardUnavailable kind={kind} />);
    expect(screen.getByRole("alert").textContent).toContain(text);
    expect(screen.getByRole("heading")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
