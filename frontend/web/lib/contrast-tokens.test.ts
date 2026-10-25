import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// B-29 (WCAG 1.4.11): graphics and control borders need 3:1 against what they sit on.
// Tokens are read from globals.css; colours there are hex or rgba().

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

type Rgba = [number, number, number, number];

function block(selector: string): Record<string, string> {
  // Top-level rule only (the prefers-contrast overrides are indented).
  const m = css.match(new RegExp(`^${selector.replace(".", "\\.")} \\{([\\s\\S]*?)^\\}`, "m"));
  if (!m) throw new Error(`no ${selector} block`);
  const out: Record<string, string> = {};
  for (const d of m[1].matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) out[d[1]] = d[2].trim();
  return out;
}

const themes = { light: block(":root"), dark: { ...block(":root"), ...block(".dark") } };

function parse(value: string, tokens: Record<string, string>): Rgba {
  const v = value.trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return parse(tokens[ref[1]], tokens);
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = v.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((x) => x.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`unsupported colour: ${value}`);
}

const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba;
};

const lum = ([r, g, b]: Rgba) => {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const ratio = (a: Rgba, b: Rgba) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe.each(["light", "dark"] as const)("non-text contrast, %s", (name) => {
  const t = themes[name];
  const c = (token: string) => parse(t[`--${token}`], t);
  const solid = (token: string, base: Rgba) => over(c(token), base);

  it("goal progress fill vs track, and vs the card and the dashboard tile it sits on", () => {
    for (const surface of ["card", "muted"]) {
      const bg = solid(surface, c("card"));
      const track = over(c("track"), bg);
      expect(ratio(solid("primary-graphic", bg), track), surface).toBeGreaterThanOrEqual(3);
      expect(ratio(solid("primary-graphic", bg), bg), surface).toBeGreaterThanOrEqual(3);
      expect(ratio(solid("destructive", bg), track), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it('the "Now" bar vs the card', () => {
    expect(ratio(c("primary-graphic"), c("card"))).toBeGreaterThanOrEqual(3);
    expect(ratio(c("destructive"), c("card"))).toBeGreaterThanOrEqual(3);
  });

  it("past-month bars vs the card (regression)", () => {
    expect(ratio(c("bar"), c("card"))).toBeGreaterThanOrEqual(3);
  });

  it("every donut slice vs the card", () => {
    for (let i = 1; i <= 6; i++) {
      expect(ratio(c(`chart-${i}`), c("card")), `chart-${i}`).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(c("muted-foreground"), c("card"))).toBeGreaterThanOrEqual(3); // "Other"
  });

  it("input border vs the surfaces a field sits on", () => {
    for (const surface of ["card", "background", "muted"]) {
      const bg = solid(surface, c("background"));
      expect(ratio(over(c("input"), bg), bg), surface).toBeGreaterThanOrEqual(3);
    }
  });
});
