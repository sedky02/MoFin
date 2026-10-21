import { expect, test, type Page } from "@playwright/test";

// B-20: the mobile bottom bar is Dashboard · Transactions · Add · Goals · More,
// and More opens the same nav sheet as the topbar hamburger. Needs the UX
// fixture (`npm run e2e:seed`) for the transaction detail check.

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the bottom bar only exists below the lg breakpoint");
  // The dev-only Next indicator and query devtools sit bottom-left, over the
  // Dashboard slot, and would swallow the tap.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, .tsqd-parent-container { display: none !important; }";
      document.head.append(style);
    });
  });
});

const bar = (page: Page) => page.getByRole("navigation", { name: "Primary mobile" });
// The open sheet is modal, so the bar leaves the accessibility tree and
// getByRole can't see More while it's open.
const moreButton = (page: Page) => page.locator('nav[aria-label="Primary mobile"] button[aria-haspopup="dialog"]');

const SLOTS = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "Transactions", path: "/search" },
  { name: "Add", path: "/transactions/new" },
  { name: "Goals", path: "/goals" },
] as const;

test("the bar has exactly Dashboard, Transactions, Add, Goals, More, in order", async ({ page }) => {
  await page.goto("/dashboard");
  const items = bar(page).locator("a, button");
  await expect(items).toHaveText(["Dashboard", "Transactions", "Add", "Goals", "More"]);
});

test("each slot is one tap away and marks its page as current", async ({ page }) => {
  await page.goto("/settings");
  for (const slot of SLOTS) {
    await bar(page).getByRole("link", { name: slot.name, exact: true }).click();
    // Generous timeout: `next dev` compiles a route on its first visit.
    await expect(page).toHaveURL(new RegExp(`${slot.path}(\\?.*)?$`), { timeout: 15_000 });
    await expect(bar(page).locator('[aria-current="page"]')).toHaveText(slot.name);
  }
});

test("the Transactions slot stays current on a transaction detail page", async ({ page }) => {
  const res = await page.request.get("/api/backend/search/transactions", { params: { limit: 1, offset: 0 } });
  expect(res.ok(), `search failed with ${res.status()}`).toBeTruthy();
  const { data } = (await res.json()) as { data: { id: string }[] };
  expect(data.length, "no transactions: run `npm run e2e:seed`").toBeGreaterThan(0);
  await page.goto(`/transactions/${data[0].id}`);
  await expect(bar(page).getByRole("link", { name: "Transactions", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(bar(page).getByRole("link", { name: "Add", exact: true })).not.toHaveAttribute("aria-current", "page");
});

test("More opens the nav sheet with the remaining items", async ({ page }) => {
  await page.goto("/dashboard");
  const more = bar(page).getByRole("button", { name: "More" });
  await expect(more).toHaveAttribute("aria-haspopup", "dialog");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(moreButton(page)).toHaveAttribute("aria-expanded", "true");
  for (const name of ["Accounts", "Drafts", "Categories", "AI Connector", "Settings"]) {
    await expect(dialog.getByRole("link", { name })).toBeVisible();
  }

  await dialog.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dialog).toBeHidden();
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

test("every slot is at least 44x44 px", async ({ page }) => {
  await page.goto("/dashboard");
  const items = bar(page).locator("a, button");
  await expect(items).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const box = await items.nth(i).boundingBox();
    expect(box, `slot ${i} not rendered`).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
