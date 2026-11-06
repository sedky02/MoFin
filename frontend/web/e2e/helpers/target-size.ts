import type { Page } from "@playwright/test";

export type SmallTarget = {
  selector: string;
  text: string;
  width: number;
  height: number;
  /** True when the WCAG 2.5.8 spacing exception does not rescue it. */
  failsSpacing: boolean;
};

const MIN = 24;

/**
 * Visible interactive elements below `minSize` (default 24px, WCAG 2.5.8) in either axis, and
 * whether the spacing exception applies (only evaluated against 24).
 */
export async function findSmallTargets(page: Page, minSize = MIN): Promise<SmallTarget[]> {
  return page.evaluate(
    ({ minSize, MIN }) => {
      const sel =
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"])';
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const els = Array.from(document.querySelectorAll(sel)).filter(visible);
      const rects = els.map((e) => e.getBoundingClientRect());
      const describe = (el: Element) => {
        const id = el.id ? `#${el.id}` : "";
        const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
        return `${el.tagName.toLowerCase()}${id}${cls}`;
      };
      const circleHitsRect = (cx: number, cy: number, r: number, rect: DOMRect) => {
        const nx = Math.max(rect.left, Math.min(cx, rect.right));
        const ny = Math.max(rect.top, Math.min(cy, rect.bottom));
        return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
      };

      const out: SmallTarget[] = [];
      els.forEach((el, i) => {
        const r = rects[i];
        if (r.width >= minSize && r.height >= minSize) return;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const crowded = rects.some((o, j) => j !== i && circleHitsRect(cx, cy, MIN / 2, o));
        const undersized24 = r.width < MIN || r.height < MIN;
        out.push({
          selector: describe(el),
          text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
          failsSpacing: undersized24 && crowded,
        });
      });
      return out;
    },
    { minSize, MIN },
  );
}
