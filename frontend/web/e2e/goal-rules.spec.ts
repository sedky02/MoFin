import { expect, test, type Page } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// Goal cards, history labels and the Cancel confirm say what they really do. Read-only; needs `npm
// run e2e:seed`.

const RULES = {
  Balance: "Saving? A Balance goal tracks the account's balance, so transfers in count.",
  Income: "Transfers in don't count.",
  Expense: "Transfers out don't count. Judged when the period ends.",
} as const;

function goalCard(page: Page, name: string) {
  return page.locator("h3", { hasText: name }).locator("xpath=ancestor::*[contains(@class,'group')][1]");
}

test("the goal dialog shows helper text for each goal type", async ({ page }) => {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  const rule = dialog.getByTestId("goal-rule");

  await expect(rule).toContainText(RULES.Balance);

  for (const type of ["Income", "Expense", "Balance"] as const) {
    await dialog.getByRole("radio", { name: new RegExp(`^${type}`) }).click();
    await expect(rule).toContainText(RULES[type]);
  }

  await expect(dialog.getByLabel("Goal type")).toHaveAccessibleDescription(/so transfers in count/);

  const violations = await runAxe(page);
  expect(violations, formatViolations(violations)).toEqual([]);

  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("goal history labels the open period as live, matching the card", async ({ page }) => {
  await page.goto("/goals");
  const card = goalCard(page, "Monthly spending cap");
  // The card's progress amount (the bold one before " / target"). innerText can repeat the amount
  // (visible + screen-reader copy) on two lines.
  const cardAmount = (await card.locator(".tabular.font-semibold").first().innerText()).trim().split("\n")[0].trim();

  await card.getByRole("button", { name: "Actions for Monthly spending cap" }).click();
  await page.getByRole("menuitem", { name: "View history" }).click();
  const dialog = page.getByRole("dialog", { name: /Monthly spending cap/ });
  await expect(dialog.getByText(/Finished periods keep the result recorded when they ended/)).toBeVisible();

  const current = dialog.getByTestId("goal-history-row").first();
  await expect(current.getByTestId("goal-history-source")).toHaveText("Current period (live)");
  await expect(current).toContainText(cardAmount);

  const rows = dialog.getByTestId("goal-history-row");
  const count = await rows.count();
  for (let i = 1; i < count; i++) {
    await expect(rows.nth(i).getByTestId("goal-history-source")).toHaveText("Recorded at period end");
  }

  await page.keyboard.press("Escape");
});

test("the Cancel goal confirm says it stops tracking and restarts from the restore day", async ({ page }) => {
  await page.goto("/goals");
  const card = goalCard(page, "Monthly spending cap");
  await card.getByRole("button", { name: "Actions for Monthly spending cap" }).click();
  await page.getByRole("menuitem", { name: "Cancel goal" }).click();

  const confirm = page.getByRole("alertdialog", { name: 'Cancel "Monthly spending cap"?' });
  await expect(confirm).toContainText("Stops tracking");
  await expect(confirm).toContainText("You can restore it later; it restarts from that day.");

  await confirm.getByRole("button", { name: "Keep goal" }).click();
  await expect(goalCard(page, "Monthly spending cap")).toBeVisible();
});
