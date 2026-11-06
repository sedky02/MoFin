import { expect, test, type Page } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// Every control has an accessible name (filters, split row category and note). Needs `npm run
// e2e:seed`.
test.use({ locale: "en-US" });

const FIXTURE_SPLIT = "Supermarket and pharmacy receipt";
const NAME_RULES = new Set(["button-name", "label", "select-name"]);

// The dev-only Next indicator and query devtools would count against axe's targets.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, .tsqd-parent-container { display: none !important; }";
      document.head.append(style);
    });
  });
});

async function nameViolations(page: Page) {
  const violations = (await runAxe(page)).filter((v) => NAME_RULES.has(v.id));
  expect(violations, formatViolations(violations)).toEqual([]);
}

test("/transactions: the filter dropdowns are named and unambiguous", async ({ page }) => {
  await page.goto("/transactions");
  for (const name of ["Account", "Category", "Per page"]) {
    await expect(page.getByRole("combobox", { name, exact: true })).toHaveCount(1);
  }
  await nameViolations(page);
});

test("/transactions/new: split rows name their category and note", async ({ page }) => {
  await page.goto("/transactions/new");
  await page.getByRole("button", { name: "Split transaction" }).click();

  for (const n of [1, 2]) {
    await expect(page.getByLabel(`Item ${n} category`)).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: `Item ${n} category` })).toBeVisible();
    await expect(page.getByLabel(`Item ${n} note`)).toHaveCount(1);
  }
  await nameViolations(page);
});

test("/transactions/[id]/edit: an existing split's rows are named", async ({ page }) => {
  const res = await page.request.get("/api/backend/search/transactions", {
    params: { q: FIXTURE_SPLIT, limit: "10", offset: "0" },
  });
  expect(res.ok(), `search failed with ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { data: { id: string; description: string }[] };
  const split = body.data.find((t) => t.description === FIXTURE_SPLIT);
  expect(split, "fixture split not found: run `npm run e2e:seed`").toBeTruthy();

  await page.goto(`/transactions/${split!.id}/edit`);
  await expect(page.getByRole("combobox", { name: "Item 1 category" })).toBeVisible();
  await expect(page.getByLabel("Item 2 category")).toHaveCount(1);
  await expect(page.getByLabel("Item 2 note")).toHaveCount(1);
  await nameViolations(page);
});
