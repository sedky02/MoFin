// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useCountUp } from "@/hooks/use-count-up";

function Probe({ target, enabled }: { target: number; enabled?: boolean }) {
  const value = useCountUp(target, { enabled });
  return <span>{value}</span>;
}

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({ matches: reduced && query.includes("reduce") }) as MediaQueryList,
  );
}

const shown = (c: HTMLElement) => Number(c.querySelector("span")!.textContent);

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCountUp", () => {
  it("starts at 0 and reaches the target", () => {
    const { container } = render(<Probe target={100} />);
    expect(shown(container)).toBe(0);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const mid = shown(container);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThanOrEqual(100);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(shown(container)).toBe(100);
  });

  it("jumps straight to the value when reduced motion is preferred", () => {
    stubReducedMotion(true);
    const { container } = render(<Probe target={42} />);
    expect(shown(container)).toBe(42);
  });

  it("jumps straight to the value when disabled", () => {
    const { container } = render(<Probe target={42} enabled={false} />);
    expect(shown(container)).toBe(42);
  });

  it("glides from the current value to a new target without restarting from 0", () => {
    const { container, rerender } = render(<Probe target={100} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(shown(container)).toBe(100);
    rerender(<Probe target={200} />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(shown(container)).toBeGreaterThanOrEqual(100);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(shown(container)).toBe(200);
  });

  it("never overshoots the target", () => {
    const { container } = render(<Probe target={100} />);
    for (let i = 0; i < 120; i++) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
      expect(shown(container)).toBeLessThanOrEqual(100);
    }
  });
});
