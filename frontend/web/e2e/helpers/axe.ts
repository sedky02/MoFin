import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"];

/** Waits for the page to settle (networkidle + 1.5 s), then runs axe with the project tag set. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
}

/** `include`: a selector to check only that part of the page, e.g. an open dialog. */
export async function runAxe(page: Page, opts: { skipSettle?: boolean; include?: string } = {}) {
  if (!opts.skipSettle) await settle(page);
  // The dev-only Next indicator and query devtools button sit over the bottom
  // nav's first tab; they aren't part of the app and don't ship to production.
  await page.addStyleTag({ content: "nextjs-portal, .tsqd-parent-container { display: none !important; }" });
  const axe = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (opts.include) axe.include(opts.include);
  const results = await axe.analyze();
  return results.violations;
}

export function formatViolations(violations: Awaited<ReturnType<typeof runAxe>>): string {
  return violations
    .map((v) => {
      const targets = v.nodes
        .slice(0, 5)
        .map((n) => `    ${n.target.join(" ")}`)
        .join("\n");
      return `- [${v.impact ?? "n/a"}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n${targets}`;
    })
    .join("\n");
}
