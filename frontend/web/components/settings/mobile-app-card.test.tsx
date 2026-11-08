// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MobileAppCard } from "@/components/settings/mobile-app-card";
import { GetTheApp } from "@/components/landing/get-the-app";
import type { LatestAppReleases } from "@/lib/app-release";

let releases: LatestAppReleases | undefined;
vi.mock("@/hooks/useAppRelease", () => ({
  useAppRelease: () => ({ data: releases, isLoading: false }),
}));

const android = {
  version: "1.0.3",
  build: 12,
  url: "https://example.com/mofin.apk",
  legacyUrl: "https://example.com/mofin-legacy.apk",
  notes: ["Update banner", "Faster sync"],
  publishedAt: "2026-11-09T10:00:00Z",
};

afterEach(cleanup);

// The landing phone animates once it scrolls into view, which jsdom can't observe.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

describe("MobileAppCard", () => {
  it("offers the newest Android build with its notes and the older-phone build", () => {
    releases = { android, ios: null };
    render(<MobileAppCard />);
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("href")).toBe(android.url);
    expect(screen.getByText(/Version 1\.0\.3/)).toBeTruthy();
    expect(screen.getByText("Faster sync")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Older Android phone/ }).getAttribute("href")).toBe(android.legacyUrl);
    expect(screen.getByText(/iPhone · Coming soon/)).toBeTruthy();
  });

  it("says nothing is available yet instead of a dead button", () => {
    releases = { android: null, ios: null };
    render(<MobileAppCard />);
    expect(screen.getByText("Not available to download yet.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Download" })).toBeNull();
  });
});

describe("GetTheApp", () => {
  it("shows the Android download on the landing page", () => {
    releases = { android, ios: null };
    render(<GetTheApp />);
    expect(screen.getByRole("heading", { name: "Your money, in your pocket." })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Download for Android/ }).getAttribute("href")).toBe(android.url);
  });

  it("stays hidden until a build is published", () => {
    releases = { android: null, ios: null };
    const { container } = render(<GetTheApp />);
    expect(container.innerHTML).toBe("");
  });
});
