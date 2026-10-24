import { expect, test } from "@playwright/test";

// B-27: every goal card, dashboard tile and the goal dialog says what the goal counts.
// Needs the UX fixture: `npm run e2e:seed`.

const EXPENSE = "Counts all expenses from Main checking";
const INCOME = "Counts all income into Main checking";
const BALANCE = "Tracks the balance of Emergency fund";

test("goal cards show the scope line", async ({ page }) => {
  await page.goto("/goals");
  await expect(page.getByRole("heading", { level: 1, name: "Goals" })).toBeVisible();

  const card = (name: string) =>
    page.locator("h3", { hasText: name }).locator("xpath=ancestor::*[contains(@class,'group')][1]");
  await expect(card("Monthly spending cap").getByTestId("goal-scope")).toHaveText(EXPENSE);
  await expect(card("Freelance income target").getByTestId("goal-scope")).toHaveText(INCOME);
  await expect(card("Emergency fund target").getByTestId("goal-scope")).toHaveText(BALANCE);
});

test("dashboard tiles show the scope line", async ({ page }) => {
  await page.goto("/dashboard");
  const tiles = page.getByTestId("goal-scope");
  await expect(tiles.first()).toBeVisible();
  const texts = await tiles.allTextContents();
  expect(texts.length).toBeGreaterThan(0);
  for (const t of texts) {
    expect(t).toMatch(/^(Counts all (income into|expenses from)|Tracks the balance of) \S/);
  }
});

test("the goal dialog updates the scope line as type and account change", async ({ page }) => {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  const scope = dialog.getByTestId("goal-scope");
  await expect(scope).toContainText("Tracks the balance of");

  await dialog.getByLabel("Account").click();
  await page.getByRole("option", { name: /Main checking/ }).click();
  await expect(scope).toHaveText("Tracks the balance of Main checking");

  await dialog.getByLabel("Goal type").click();
  await page.getByRole("option", { name: /^Expense/ }).click();
  await expect(scope).toHaveText(EXPENSE);

  await dialog.getByLabel("Goal type").click();
  await page.getByRole("option", { name: /^Income/ }).click();
  await expect(scope).toHaveText(INCOME);

  await dialog.getByRole("button", { name: "Cancel" }).click();
});
