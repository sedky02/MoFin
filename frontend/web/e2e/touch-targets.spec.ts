import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { settle } from "./helpers/axe";

// B-32: on a coarse pointer every interactive element's effective target (its
// box united with any ::before / ::after hit slop) is at least 44 px, and the
// segmented options split the space so tapping an option's centre selects it.
// Needs the UX fixture (`npm run e2e:seed`).

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "touch targets only apply to the coarse-pointer project");
  // The dev-only Next indicator and query devtools are not part of the app.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, .tsqd-parent-container { display: none !important; }";
      document.head.append(style);
    });
  });
});

const ROUTES = [
  "/dashboard",
  "/transactions",
  "/transactions/new",
  "/goals",
  "/categories",
  "/accounts",
  "/drafts",
  "/settings",
];

const MIN = 44;
// Secondary buttons: <Button> adds 6 px of slop per side, so its xs/sm/icon-xs/icon-sm
// sizes land at 36-40 px. They are accepted down to this size.
const MIN_SECONDARY_BUTTON = 40;

type Measured = { desc: string; width: number; height: number; secondary: boolean };

async function measure(page: Page): Promise<Measured[]> {
  return page.evaluate(() => {
    const sel =
      'a[href], button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="radio"], [role="menuitem"], [role="option"]';
    const out: { desc: string; width: number; height: number; secondary: boolean }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest("nextjs-portal, .tsqd-parent-container")) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      // The skip link is clipped until focused.
      if (el.matches('a[href="#main"]')) continue;
      // WCAG 2.5.8 inline exception: a link inside running text.
      if (el.tagName === "A" && cs.display === "inline" && el.closest("p, li")) continue;
      let left = r.left;
      let top = r.top;
      let right = r.right;
      let bottom = r.bottom;
      for (const pseudo of ["::before", "::after"] as const) {
        const p = getComputedStyle(el, pseudo);
        if (p.position !== "absolute" || p.content === "none") continue;
        const w = parseFloat(p.width);
        const h = parseFloat(p.height);
        if (!(w > 0 && h > 0)) continue;
        // Offsets are relative to the padding box.
        const pl = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(p.left);
        const pt = r.top + parseFloat(cs.borderTopWidth) + parseFloat(p.top);
        if (Number.isNaN(pl) || Number.isNaN(pt)) continue;
        left = Math.min(left, pl);
        top = Math.min(top, pt);
        right = Math.max(right, pl + w);
        bottom = Math.max(bottom, pt + h);
      }
      const id = el.id ? `#${el.id}` : "";
      out.push({
        desc: `${el.tagName.toLowerCase()}${id}[${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}]`,
        width: Math.round((right - left) * 10) / 10,
        height: Math.round((bottom - top) * 10) / 10,
        secondary: el.dataset.slot === "button",
      });
    }
    return out;
  });
}

for (const route of ROUTES) {
  test(`${route}: every interactive element has a 44 px effective target`, async ({ page }) => {
    await page.goto(route);
    await settle(page);
    const small = (await measure(page)).filter((m) => {
      const min = m.secondary ? MIN_SECONDARY_BUTTON : MIN;
      return m.width < min || m.height < min;
    });
    expect(small.map((m) => `${m.desc} ${m.width}x${m.height}`)).toEqual([]);
  });

  test(`${route}: axe target-size finds no violations`, async ({ page }) => {
    await page.goto(route);
    await settle(page);
    const results = await new AxeBuilder({ page }).withRules(["target-size"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

// Tapping the centre of each option of a segmented control selects that option.
test("tapping the centre of each segmented option selects it", async ({ page }) => {
  const groups = [
    { route: "/dashboard", option: '[role="tablist"] [role="tab"]', state: "aria-selected" },
    { route: "/dashboard", option: '[role="radiogroup"][aria-label="Currency"] [role="radio"]', state: "aria-checked" },
    { route: "/transactions", option: '[role="tablist"] [role="tab"]', state: "aria-selected" },
    { route: "/goals", option: '[role="tablist"] [role="tab"]', state: "aria-selected" },
    { route: "/accounts", option: '[role="tablist"] [role="tab"]', state: "aria-selected" },
    { route: "/drafts", option: '[role="tablist"] [role="tab"]', state: "aria-selected" },
    {
      route: "/transactions/new",
      option: '[role="radiogroup"][aria-label="Transaction type"] [role="radio"]',
      state: "aria-checked",
    },
  ];
  let tapped = 0;
  for (const g of groups) {
    await page.goto(g.route);
    await settle(page);
    const count = await page.locator(g.option).count();
    for (let i = 0; i < count; i++) {
      const opt = page.locator(g.option).nth(i);
      if (!(await opt.isVisible()) || (await opt.isDisabled())) continue;
      await opt.scrollIntoViewIfNeeded();
      const box = await opt.boundingBox();
      if (!box) continue;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.locator(g.option).nth(i), `${g.route} option ${i}`).toHaveAttribute(g.state, "true");
      tapped++;
    }
  }
  expect(tapped).toBeGreaterThan(0);
});
