import { expect, test } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// B-30: the hero chart's month bars are images with names and the same figures are in a table.
// Runs on the UX fixture (`npm run e2e:seed`).

test.use({ locale: "en-US" });

const monthName = (offset: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

test.describe("hero chart accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("img", { name: new RegExp(monthName(0)) })).toBeVisible();
  });

  test("every month bar is an image named with its month and year", async ({ page }) => {
    for (let offset = 0; offset < 6; offset++) {
      await expect(page.getByRole("img", { name: new RegExp(monthName(offset)) })).toHaveCount(1);
    }
  });

  test("the bar is described by its tooltip", async ({ page }) => {
    const bar = page.getByRole("img", { name: new RegExp(monthName(0)) });
    await bar.focus();
    const id = await bar.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    await expect(page.locator(`[id="${id}"]`)).toBeVisible();
  });

  test("a table gives the last six months of income, expenses and balance", async ({ page }) => {
    const table = page.getByRole("table", { name: /Last 6 months/ });
    await expect(table.getByRole("columnheader")).toHaveText(["Month", "Income", "Expenses", "Balance"]);
    await expect(table.getByRole("row")).toHaveCount(7); // header + 6 months
    await expect(table.getByRole("rowheader", { name: monthName(0) })).toBeAttached();
  });

  test("axe finds no aria-prohibited-attr on the dashboard", async ({ page }) => {
    const violations = await runAxe(page);
    const prohibited = violations.filter((v) => v.id === "aria-prohibited-attr");
    expect(prohibited, formatViolations(prohibited)).toEqual([]);
  });
});
