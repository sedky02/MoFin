// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/dashboard/dashboard-body", () => ({
  DashboardBody: () => <p>dashboard body</p>,
}));

import { DashboardGate, PrefetchSettled } from "@/components/dashboard/dashboard-gate";

afterEach(cleanup);

const skeletonShown = (root: ParentNode) => root.querySelector('[data-slot="skeleton"]') !== null;

describe("DashboardGate", () => {
  it("shows the dashboard at once when reached by a client-side navigation", () => {
    const { container } = render(<DashboardGate prefetch={null} />);
    expect(screen.getByText("dashboard body")).toBeTruthy();
    expect(skeletonShown(container)).toBe(false);
  });

  it("on a full page load, keeps the skeleton until the server prefetch settles", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<DashboardGate prefetch={null} />);
    document.body.appendChild(container);
    expect(skeletonShown(container)).toBe(true);

    const { rerender } = render(<DashboardGate prefetch={null} />, { container, hydrate: true });
    expect(skeletonShown(container)).toBe(true);
    expect(screen.queryByText("dashboard body")).toBeNull();

    await act(async () => rerender(<DashboardGate prefetch={<PrefetchSettled outcome="ready" />} />));
    expect(screen.getByText("dashboard body")).toBeTruthy();
    expect(skeletonShown(container)).toBe(false);
  });

  it("says why when the server prefetch failed", async () => {
    await act(async () => {
      render(<DashboardGate prefetch={<PrefetchSettled outcome="timeout" />} />);
    });
    expect(screen.getByRole("alert").textContent).toContain("MoFin is taking too long to respond.");
    expect(screen.queryByText("dashboard body")).toBeNull();
  });
});
