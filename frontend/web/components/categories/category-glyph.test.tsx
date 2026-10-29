// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CategoryGlyph } from "@/components/categories/category-glyph";

afterEach(cleanup);

describe("CategoryGlyph", () => {
  it("draws the chosen line icon, with no text", () => {
    const { container } = render(<CategoryGlyph category={{ name: "Food", icon: "cart" }} className="size-4" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent).toBe("");
  });

  it("still shows an emoji saved by an older version", () => {
    const { container } = render(<CategoryGlyph category={{ name: "Food", icon: "🍔" }} />);
    expect(container.textContent).toBe("🍔");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("falls back to an icon picked from the name when none is set", () => {
    const { container } = render(<CategoryGlyph category={{ name: "Groceries", icon: null }} className="size-4" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent).toBe("");
  });

  it("is decorative, hidden from screen readers", () => {
    const { container } = render(<CategoryGlyph category={{ name: "Food", icon: "cart" }} />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
