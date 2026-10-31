// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HowItWorks } from "./draft-flow";

// motion reads the preference once and keeps it, so each test sets it here instead.
let reduce = false;
vi.mock("motion/react", async (orig) => ({
  ...(await orig<typeof import("motion/react")>()),
  useReducedMotion: () => reduce,
}));

describe("HowItWorks", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    reduce = false;
  });

  it("pins the demo on a desktop for a long scroll, which plays it", () => {
    const { container } = render(<HowItWorks />);
    const track = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(track.className).toContain("lg:h-[320vh]");
    expect(track.firstElementChild!.className).toContain("lg:sticky");
  });

  it("has no Play again button: scrolling back rewinds it", () => {
    render(<HowItWorks />);
    expect(screen.queryByRole("button", { name: /Play again/ })).toBeNull();
  });

  it("starts before anything has happened: no step is current, the question not sent", () => {
    const { container } = render(<HowItWorks />);
    expect(container.querySelector('[aria-current="step"]')).toBeNull();
    // The reply is only in the invisible space kept for it, not written out yet.
    const shown = Array.from(container.querySelectorAll("p")).filter((p) => !p.closest(".invisible"));
    expect(shown.some((p) => p.textContent?.includes("Done."))).toBe(false);
  });

  it("with reduced motion, pins nothing and shows the finished result", () => {
    reduce = true;
    const { container } = render(<HowItWorks />);
    const track = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(track.className).not.toContain("320vh");
    expect(track.firstElementChild!.className).not.toContain("sticky");
    const shown = Array.from(container.querySelectorAll("p")).filter((p) => !p.closest(".invisible"));
    expect(shown.some((p) => p.textContent?.includes("Done. I've added it to MoFin as a draft"))).toBe(true);
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("It's saved");
  });
});
