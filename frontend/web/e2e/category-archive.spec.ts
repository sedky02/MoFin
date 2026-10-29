import { expect, test, type Page } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// B-11: the delete dialog says up front when a category is in use and offers
// Archive instead, the tile never vanishes and comes back, archived categories
// leave the pickers, and they can be restored from the Archived tab.
// Needs the UX fixture (`npm run e2e:seed`): "Main checking" is a USD account.
// Each test creates its own uniquely named category and removes everything it
// made, so the fixture stays as seeded.
test.use({ locale: "en-US" });

type Json = Record<string, unknown>;

async function firstPage(page: Page, path: string, params: Record<string, string | number> = {}): Promise<Json[]> {
  const res = await page.request.get(`/api/backend${path}`, { params: { limit: 100, offset: 0, ...params } });
  expect(res.ok(), `GET ${path} failed with ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { data: Json[] }).data;
}

async function mainAccountId(page: Page): Promise<string> {
  const main = (await firstPage(page, "/accounts")).find((a) => a.name === "Main checking");
  expect(main, 'fixture account "Main checking" not found: run `npm run e2e:seed`').toBeTruthy();
  return String(main!.id);
}

async function createCategory(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/backend/categories", { data: { name, type: "EXPENSE" } });
  expect(res.ok(), `creating category failed with ${res.status()}`).toBeTruthy();
  return String(((await res.json()) as Json).id);
}

function tile(page: Page, name: string) {
  return page.locator("main").locator('[data-slot="card"]').filter({ hasText: name });
}

/**
 * Records, from inside the page, every time `text` appears in or leaves the
 * page's lists, so a tile that is removed and then put back (the old
 * optimistic delete) shows up as present → absent → present. Only the page
 * content is watched: the dialog and the toast name the category too.
 */
async function watchPresence(page: Page, text: string) {
  await page.evaluate((needle) => {
    const w = window as unknown as { __presence: boolean[] };
    const present = () =>
      ((document.querySelector("main") as HTMLElement | null)?.innerText ?? "").includes(needle);
    w.__presence = [present()];
    new MutationObserver(() => {
      const now = present();
      if (now !== w.__presence[w.__presence.length - 1]) w.__presence.push(now);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }, text);
}

function presence(page: Page) {
  return page.evaluate(() => (window as unknown as { __presence: boolean[] }).__presence);
}

test.describe("archiving categories", () => {
  test("archiving a category in use leaves the pickers and can be restored", async ({ page }, testInfo) => {
    const name = `Archive check ${testInfo.project.name} ${Date.now()}`;
    const accountId = await mainAccountId(page);
    const categoryId = await createCategory(page, name);
    let transactionId: string | undefined;

    try {
      const tx = await page.request.post("/api/backend/transactions", {
        data: {
          type: "EXPENSE",
          description: `${name} purchase`,
          amount: "1.00",
          currency: "USD",
          occurredAt: new Date().toISOString(),
          fromAccountId: accountId,
          categoryId,
        },
      });
      expect(tx.ok(), `creating transaction failed with ${tx.status()}`).toBeTruthy();
      transactionId = String(((await tx.json()) as Json).id);

      await page.goto("/categories");
      await expect(tile(page, name)).toHaveCount(1);

      // There is no delete in the app: archiving asks first.
      await expect(tile(page, name).getByRole("button", { name: `Delete ${name}` })).toHaveCount(0);
      await tile(page, name).getByRole("button", { name: `Archive ${name}` }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByRole("heading", { name: `Archive "${name}"?` })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);

      const axe = await runAxe(page, { skipSettle: true });
      await testInfo.attach("axe archive dialog", { body: formatViolations(axe) || "no violations", contentType: "text/plain" });
      const violations = axe.filter((v) => v.id !== "heading-order");
      expect(violations, `axe violations with the dialog open\n${formatViolations(violations)}`).toEqual([]);

      // Archive: the tile goes once, and never comes back.
      await watchPresence(page, name);
      const archived = page.waitForResponse(
        (r) => r.url().includes(`/categories/${categoryId}/archive`) && r.request().method() === "PATCH",
      );
      await dialog.getByRole("button", { name: "Archive" }).click();
      expect((await archived).ok()).toBeTruthy();
      await expect(tile(page, name)).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      await expect(tile(page, name)).toHaveCount(0);
      expect(await presence(page)).toEqual([true, false]);

      // Gone from the API's default list, still there with status=all, and the
      // transaction keeps it.
      expect((await firstPage(page, "/categories")).some((c) => c.id === categoryId)).toBe(false);
      expect((await firstPage(page, "/categories", { status: "all" })).some((c) => c.id === categoryId)).toBe(true);
      const kept = await page.request.get(`/api/backend/transactions/${transactionId}`);
      expect(((await kept.json()) as Json).categoryId).toBe(categoryId);

      // Not offered when filing a new transaction.
      await page.addInitScript((id) => localStorage.setItem("mofin-active-account", id), accountId);
      await page.goto("/transactions/new");
      const chips = page.getByRole("radiogroup", { name: "Category" });
      await expect(chips.getByRole("radio").first()).toBeVisible();
      await expect(chips.getByRole("radio", { name: new RegExp(name) })).toHaveCount(0);

      // Restore it from the archived list.
      await page.goto("/categories");
      await expect(tile(page, name)).toHaveCount(0);
      await page.getByRole("button", { name: /^Archived/ }).click();
      await expect(tile(page, name)).toHaveCount(1);
      await tile(page, name).getByRole("button", { name: `Restore ${name}` }).click();
      await expect(tile(page, name)).toHaveCount(0);
      await page.getByRole("button", { name: "Back to categories" }).click();
      await expect(tile(page, name)).toHaveCount(1);
    } finally {
      // Leave the fixture as seeded: soft-delete the transaction, then the
      // category is unused and can go too (restoring first in case a step failed).
      if (transactionId) await page.request.delete(`/api/backend/transactions/${transactionId}`);
      await page.request.patch(`/api/backend/categories/${categoryId}/restore`);
      const removed = await page.request.delete(`/api/backend/categories/${categoryId}`);
      expect(removed.ok(), `cleaning up the category failed with ${removed.status()}`).toBeTruthy();
    }
  });

  test("an unused category is archived too, and Undo brings it back", async ({ page }, testInfo) => {
    const name = `Undo check ${testInfo.project.name} ${Date.now()}`;
    const categoryId = await createCategory(page, name);

    try {
      await page.goto("/categories");
      await tile(page, name).getByRole("button", { name: `Archive ${name}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
      await expect(tile(page, name)).toHaveCount(0);

      // It is archived, not deleted: still there with status=all, and restorable.
      expect((await firstPage(page, "/categories", { status: "archived" })).some((c) => c.id === categoryId)).toBe(true);

      await page.getByRole("button", { name: "Undo" }).click();
      await expect(tile(page, name)).toHaveCount(1);
      expect((await firstPage(page, "/categories")).some((c) => c.id === categoryId)).toBe(true);
    } finally {
      // Tidy the fixture through the API: restoring first in case the test stopped halfway.
      await page.request.patch(`/api/backend/categories/${categoryId}/restore`);
      await page.request.delete(`/api/backend/categories/${categoryId}`);
    }
  });
});
