// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/dashboard/dashboard-body", () => ({
  DashboardBody: ({ year, month }: { year: number; month: number }) => (
    <p>
      dashboard body <span data-testid="month">{`${year}-${month}`}</span>
    </p>
  ),
}));

import { DashboardGate, PrefetchSettled } from "@/components/dashboard/dashboard-gate";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const skeletonShown = (root: ParentNode) => root.querySelector('[data-slot="skeleton"]') !== null;

describe("DashboardGate", () => {
  it("shows the dashboard at once when reached by a client-side navigation", () => {
    const { container } = render(<DashboardGate prefetch={null} />);
    expect(screen.getByText(/dashboard body/)).toBeTruthy();
    expect(skeletonShown(container)).toBe(false);
  });

  it("shows the month the API files new transactions under (UTC), even past local midnight on the 1st", () => {
    // 00:30 on November 1st in Tunis, still October 31st in UTC.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T23:30:00Z"));
    render(<DashboardGate prefetch={null} />);
    expect(screen.getByTestId("month").textContent).toBe("2026-10");
  });

  it("on a full page load, keeps the skeleton until the server prefetch settles", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<DashboardGate prefetch={null} />);
    document.body.appendChild(container);
    expect(skeletonShown(container)).toBe(true);

    const { rerender } = render(<DashboardGate prefetch={null} />, { container, hydrate: true });
    expect(skeletonShown(container)).toBe(true);
    expect(screen.queryByText(/dashboard body/)).toBeNull();

    await act(async () => rerender(<DashboardGate prefetch={<PrefetchSettled outcome="ready" />} />));
    expect(screen.getByText(/dashboard body/)).toBeTruthy();
    expect(skeletonShown(container)).toBe(false);
  });

  it("says why when the server prefetch failed", async () => {
    await act(async () => {
      render(<DashboardGate prefetch={<PrefetchSettled outcome="timeout" />} />);
    });
    expect(screen.getByRole("alert").textContent).toContain("MoFin is taking too long to respond.");
    expect(screen.queryByText(/dashboard body/)).toBeNull();
  });
});
