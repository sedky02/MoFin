import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// B-23b: Settings → Data downloads the user's data as JSON or CSV. Uses the
// fixture user (`npm run e2e:seed`).
//
// The backend allows 10 exports an hour per user (in memory, so restarting it
// resets the count). To leave room for reruns, only the desktop project
// downloads; mobile checks that the card and its buttons are there.

function dataCard(page: Page) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Data", level: 2 }) });
}

async function download(page: Page, label: string) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    dataCard(page).getByRole("button", { name: label }).click(),
  ]);
  expect(await file.failure()).toBeNull();
  const path = await file.path();
  return { name: file.suggestedFilename(), body: readFileSync(path) };
}

test.describe("settings data export", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await expect(dataCard(page)).toBeVisible();
  });

  test("shows the Data card with both export buttons", async ({ page }, testInfo) => {
    const card = dataCard(page);
    await expect(
      card.getByText("Download your accounts, categories, transactions and goals. Deleted transactions are left out."),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: "Export JSON" })).toBeEnabled();
    await expect(card.getByRole("button", { name: "Export CSV" })).toBeEnabled();

    const violations = await runAxe(page);
    await testInfo.attach("axe settings", { body: formatViolations(violations) || "no violations", contentType: "text/plain" });
    expect.soft(violations, formatViolations(violations)).toEqual([]);
  });

  test("Export JSON downloads the user's data", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "downloads run once per pass; see the throttle note above");

    const { name, body } = await download(page, "Export JSON");

    expect(name).toMatch(/^mofin-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(body.length).toBeGreaterThan(0);
    const doc = JSON.parse(body.toString("utf8"));
    expect(doc).toEqual(
      expect.objectContaining({
        exportedAt: expect.any(String),
        user: expect.objectContaining({ email: expect.any(String) }),
        accounts: expect.any(Array),
        categories: expect.any(Array),
        transactions: expect.any(Array),
        goals: expect.any(Array),
      }),
    );
    expect(doc.transactions.length).toBeGreaterThan(0);
  });

  test("Export CSV downloads one row per transaction line", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "downloads run once per pass; see the throttle note above");

    const { name, body } = await download(page, "Export CSV");

    expect(name).toMatch(/^mofin-export-\d{4}-\d{2}-\d{2}\.csv$/);
    // UTF-8 BOM, so Excel keeps accents.
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = body.subarray(3).toString("utf8").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Date,Description,Type,Account,Category,Amount,Currency,Transaction ID");
    expect(lines.length).toBeGreaterThan(1);
  });
});
