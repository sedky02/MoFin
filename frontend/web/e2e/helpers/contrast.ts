import type { Locator } from "@playwright/test";

export type ContrastResult = {
  ratio: number;
  foreground: string;
  background: string;
  fontSizePx: number;
  fontWeight: number;
  /** WCAG AA threshold for this text size (3 for large text, 4.5 otherwise). */
  required: number;
  pass: boolean;
};

/**
 * Contrast of an element's text over its first solid ancestor background; colours go through a
 * canvas so oklch(), lab() and color-mix() work.
 */
export async function getContrast(locator: Locator): Promise<ContrastResult> {
  return locator.evaluate((el) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const toRgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const blend = (top: number[], bottom: number[]) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    const layers: number[][] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const bg = toRgba(getComputedStyle(n).backgroundColor);
      if (bg[3] > 0) {
        layers.push(bg);
        if (bg[3] === 1) break;
      }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);

    const style = getComputedStyle(el);
    const fgRaw = toRgba(style.color);
    const fg = blend(fgRaw, base);
    const l1 = lum(fg);
    const l2 = lum(base);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    const fontSizePx = parseFloat(style.fontSize);
    const fontWeight = parseInt(style.fontWeight, 10) || 400;
    const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
    const required = large ? 3 : 4.5;
    const hex = (c: number[]) => `rgb(${c.slice(0, 3).map((v) => Math.round(v)).join(", ")})`;
    return {
      ratio: Math.round(ratio * 100) / 100,
      foreground: hex(fg),
      background: hex(base),
      fontSizePx,
      fontWeight,
      required,
      pass: ratio >= required,
    };
  });
}
