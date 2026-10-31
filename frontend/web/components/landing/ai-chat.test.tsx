// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiChat } from "./ai-chat";

// motion reads the preference once and keeps it, so each test sets it here instead.
let reduce = false;
vi.mock("motion/react", async (orig) => ({
  ...(await orig<typeof import("motion/react")>()),
  useReducedMotion: () => reduce,
}));
const mockMotionPreference = (value: boolean) => {
  reduce = value;
};

describe("AiChat", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    reduce = false;
  });

  it("pins the section for a long scroll, and plays the conversation as you scroll through it", () => {
    mockMotionPreference(false);
    const { container } = render(<AiChat />);
    const track = container.firstElementChild as HTMLElement;
    expect(track.className).toContain("h-[240vh]");
    expect(track.firstElementChild!.className).toContain("sticky");
    // Scroll has not started: the question is not sent yet.
    expect(screen.getByRole("group", { name: "Show a conversation with" })).toBeTruthy();
  });

  it("with reduced motion, pins nothing and shows each conversation finished", async () => {
    mockMotionPreference(true);
    const { container } = render(<AiChat />);
    const track = container.firstElementChild as HTMLElement;
    expect(track.className).not.toContain("240vh");
    expect(track.firstElementChild!.className).not.toContain("sticky");
    expect(container.textContent).toContain("$612.40 on food so far in October");

    await userEvent.click(screen.getByRole("button", { name: /ChatGPT/ }));
    expect(screen.getByRole("button", { name: /ChatGPT/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("starts on Claude, which is the one the scroll plays", () => {
    mockMotionPreference(false);
    render(<AiChat />);
    expect(screen.getByRole("button", { name: /Claude/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /ChatGPT/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("plays ChatGPT's conversation only once it is picked, on its own clock", async () => {
    mockMotionPreference(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { container } = render(<AiChat />);
      const shown = () =>
        Array.from(container.querySelectorAll("p"))
          .filter((p) => !p.closest(".invisible") && !p.closest(".sr-only") && p.className.includes("leading-relaxed"))
          .map((p) => p.textContent)
          .join("");
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole("button", { name: /ChatGPT/ }));
      expect(screen.getByRole("button", { name: /ChatGPT/ }).getAttribute("aria-pressed")).toBe("true");
      // Nothing yet: it has only just started.
      expect(shown()).not.toContain("Yes. $9,454");
      // In small steps, so each stage's timers exist before the clock reaches them.
      for (let i = 0; i < 60; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(200);
        });
      }
      expect(shown()).toContain("Yes. $9,454 of $10,000 saved");
    } finally {
      vi.useRealTimers();
    }
  });

  it("has no Play again button: scrolling back rewinds it", () => {
    mockMotionPreference(false);
    render(<AiChat />);
    expect(screen.queryByRole("button", { name: /Play again/ })).toBeNull();
  });
});
