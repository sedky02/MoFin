// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useMediaQuery } from "@/hooks/use-media-query";

function Probe() {
  return <span>{useMediaQuery("(max-width: 639px)") ? "phone" : "wide"}</span>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("is false where matchMedia doesn't exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<Probe />);
    expect(screen.getByText("wide")).toBeTruthy();
  });

  it("reads the query and follows it when it changes", () => {
    let matches = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }));
    render(<Probe />);
    expect(screen.getByText("phone")).toBeTruthy();

    act(() => {
      matches = false;
      listeners.forEach((l) => l());
    });
    expect(screen.getByText("wide")).toBeTruthy();
  });
});
