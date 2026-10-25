import { expect, test, type Page } from "@playwright/test";

// B-29 (WCAG 1.4.11): progress fills, chart bars and donut slices clear 3:1 against what
// they sit on, in both themes. Runs in the desktop and mobile projects on the UX fixture
// (`npm run e2e:seed`). Colours come from getComputedStyle and are composited over the
// element's solid background.

type Pair = { name: string; ratio: number };

/** Runs in the page: contrast of each graphic against its track and/or surface. */
async function measure(page: Page): Promise<Pair[]> {
  return page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgba = (css: string): number[] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const blend = (top: number[], bottom: number[]) =>
      [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
    const lum = ([r, g, b]: number[]) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    /** Composited background behind `el`: ancestors' layers up to the first opaque one. */
    const behind = (el: Element): number[] => {
      const layers: number[][] = [];
      for (let n = el.parentElement; n; n = n.parentElement) {
        const bg = rgba(getComputedStyle(n).backgroundColor);
        if (bg[3] > 0) {
          layers.push(bg);
          if (bg[3] === 1) break;
        }
      }
      let base = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
      return base;
    };

    const out: { name: string; ratio: number }[] = [];
    const add = (name: string, r: number) => out.push({ name, ratio: Math.round(r * 100) / 100 });

    // Goal progress bars (dashboard tiles and goal cards): fill vs track, fill vs surface.
    document.querySelectorAll<HTMLElement>('[role="progressbar"]').forEach((bar, i) => {
      const fill = bar.firstElementChild;
      if (!fill) return;
      const surface = behind(bar);
      const track = blend(rgba(getComputedStyle(bar).backgroundColor), surface);
      const fg = blend(rgba(getComputedStyle(fill).backgroundColor), track);
      add(`progress ${i} fill vs track`, ratio(fg, track));
      add(`progress ${i} fill vs surface`, ratio(fg, surface));
    });

    // Hero chart bars: the focusable [role=img] wrapper holds the bar (the child with an inline height).
    const bars = Array.from(document.querySelectorAll<HTMLElement>('[role="img"][aria-label][tabindex="0"]'));
    bars.forEach((wrap, i) => {
      const bar = wrap.querySelector<HTMLElement>(":scope > div[style*='height']");
      if (!bar) return;
      const surface = behind(wrap);
      const fg = blend(rgba(getComputedStyle(bar).backgroundColor), surface);
      add(i === bars.length - 1 ? "Now bar vs card" : `past bar ${i} vs card`, ratio(fg, surface));
    });

    // Donut slices: every arc except the first circle, which is the track.
    document.querySelectorAll<SVGCircleElement>('svg[role="img"] circle').forEach((c, i) => {
      if (i === 0 || c.getAttribute("stroke-dasharray")?.startsWith("0 ")) return;
      const surface = behind(c.ownerSVGElement!);
      add(`donut slice ${i} vs card`, ratio(blend(rgba(getComputedStyle(c).stroke), surface), surface));
    });
    return out;
  });
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`non-text contrast, ${theme}`, () => {
    test.beforeEach(async ({ page, context, baseURL }) => {
      // Pin the scope to all accounts: a remembered single account may have no
      // spending this month, and then there is no donut to measure.
      await context.addCookies([{ name: "mofin-active-account", value: "all", url: baseURL! }]);
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("mofin-theme", t);
          localStorage.setItem("mofin-active-account", "all");
        } catch {
          /* storage unavailable */
        }
      }, theme);
    });

    test("dashboard: Now bar, past bars, donut slices and goal progress", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page.locator('[role="img"][aria-label][tabindex="0"]').first()).toBeVisible();
      // The summary opens in the primary currency; when that has no spending this
      // month it offers the one that does.
      const switchCurrency = page.getByRole("button", { name: /^Show [A-Z]{3}$/ });
      if (await switchCurrency.isVisible()) await switchCurrency.click();
      await expect(page.locator('svg[role="img"] circle').nth(1)).toBeAttached();
      // Let the arcs finish animating in before sampling.
      await page.waitForTimeout(1200);
      const pairs = await measure(page);
      expect(pairs.some((p) => p.name === "Now bar vs card")).toBe(true);
      expect(pairs.some((p) => p.name.startsWith("donut slice"))).toBe(true);
      for (const p of pairs) expect(p.ratio, p.name).toBeGreaterThanOrEqual(3);
    });

    test("goals page: progress fill vs track and card", async ({ page }) => {
      await page.goto("/goals");
      await expect(page.getByRole("heading", { level: 1, name: "Goals" })).toBeVisible();
      await expect(page.getByRole("progressbar").first()).toBeVisible();
      const pairs = await measure(page);
      expect(pairs.some((p) => p.name.endsWith("fill vs track"))).toBe(true);
      for (const p of pairs) expect(p.ratio, p.name).toBeGreaterThanOrEqual(3);
    });
  });
}
