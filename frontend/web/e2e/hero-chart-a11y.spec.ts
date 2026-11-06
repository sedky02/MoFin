import { expect, test } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// The hero's weekly chart: each day so far is a button named with its figures, the exact amount is
// its description, and a table repeats them. Needs `npm run e2e:seed`.

test.use({ locale: "en-US" });

const todayName = () =>
  new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

/** Days of this week so far (Monday = 1 … Sunday = 7). */
const daysSoFar = () => {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
};

test.describe("hero chart accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: new RegExp(`^${todayName()}: income`) })).toBeVisible();
  });

  test("every day so far is a button named with its date and figures", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^\w+day, \w{3} \d+: income .*, expenses .*, balance / })).toHaveCount(daysSoFar());
  });

  test("the bar is described by its exact amount", async ({ page }) => {
    const bar = page.getByRole("button", { name: new RegExp(`^${todayName()}: income`) });
    await bar.focus();
    const id = await bar.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    await expect(page.locator(`[id="${id}"]`)).toBeVisible();
  });

  test("a table gives the week's income, expenses and balance", async ({ page }) => {
    const table = page.locator("table.sr-only").first();
    await expect(table.getByRole("columnheader")).toHaveText(["Day", "Income", "Expenses", "Balance"]);
    await expect(table.getByRole("row")).toHaveCount(daysSoFar() + 1); // header + each day so far
    await expect(table.getByRole("rowheader", { name: todayName() })).toBeAttached();
  });

  test("the week pager goes back a week and not past the current one", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Next week" })).toBeDisabled();
    await page.getByRole("button", { name: "Previous week" }).click();
    await expect(page.getByText("Last week")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next week" })).toBeEnabled();
  });

  test("axe finds no aria-prohibited-attr on the dashboard", async ({ page }) => {
    const violations = await runAxe(page);
    const prohibited = violations.filter((v) => v.id === "aria-prohibited-attr");
    expect(prohibited, formatViolations(prohibited)).toEqual([]);
  });
});
