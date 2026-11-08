import { expect, test } from "@playwright/test";

// Goal cards and the dialog say what the goal counts; dashboard tiles show it only as a tooltip.
// Needs `npm run e2e:seed`.

const EXPENSE = "Counts all expenses from Main checking";
const INCOME = "Counts all income into Main checking";
const BALANCE = "Tracks the balance of Emergency fund";

test("goal cards say what they count with badges", async ({ page }) => {
  await page.goto("/goals");
  await expect(page.getByRole("heading", { level: 1, name: "Goals" })).toBeVisible();

  const card = (name: string) => page.getByRole("listitem").filter({ has: page.locator("h3", { hasText: name }) });
  await expect(card("Monthly spending cap")).toContainText("All spending");
  await expect(card("Freelance income target")).toContainText("All income");
  await expect(card("Emergency fund target")).toContainText("Emergency fund");
  await expect(card("Emergency fund target")).not.toContainText("All spending");
});

test("dashboard tiles keep the scope out of the tile and show it on hover and focus", async ({ page }) => {
  await page.goto("/dashboard");
  const tile = page.locator("li").filter({ hasText: "Monthly spending cap" }).getByRole("link");
  await expect(tile).toBeVisible();
  await expect(page.getByTestId("goal-scope")).toHaveCount(0);

  await tile.hover();
  await expect(page.getByTestId("goal-scope-tooltip")).toContainText(EXPENSE);
  await expect(tile).toHaveAccessibleDescription(EXPENSE);

  // Leave in several steps: Radix closes on the next pointer move outside its grace area.
  await page.mouse.move(5, 5, { steps: 10 });
  await expect(page.getByTestId("goal-scope-tooltip")).toHaveCount(0);
  await tile.focus();
  await expect(page.getByTestId("goal-scope-tooltip")).toContainText(EXPENSE);
});

test("the goal dialog labels its fields for each kind of goal", async ({ page }) => {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "What's this goal for?" })).toBeVisible();

  await dialog.getByRole("button", { name: /Spend less/ }).click();
  await expect(dialog.getByLabel("Spending limit")).toBeFocused();
  await expect(dialog.getByRole("combobox", { name: "Spending category" })).toContainText("All spending");
  await expect(dialog.getByLabel("Goal name")).toHaveValue("Spending limit");

  await dialog.getByRole("button", { name: "Back to goal types" }).click();
  await dialog.getByRole("button", { name: /Save up/ }).click();
  await expect(dialog.getByLabel("Amount to save")).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: /category/ })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Close" }).click();
});
