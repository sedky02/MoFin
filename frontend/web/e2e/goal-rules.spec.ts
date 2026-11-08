import { expect, test, type Page } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// Goal cards, history labels and the Cancel confirm say what they really do. Read-only; needs `npm
// run e2e:seed`.

function goalCard(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.locator("h3", { hasText: name }) });
}

test("the goal dialog keeps its rules in a tip beside the category", async ({ page }) => {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Spend less/ }).click();

  await dialog.getByRole("button", { name: "What counts" }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Transfers don't count.");

  const violations = await runAxe(page);
  expect(violations, formatViolations(violations)).toEqual([]);

  await dialog.getByRole("button", { name: "Close" }).click();
});

test("goal history labels the open period as live, matching the card", async ({ page }) => {
  await page.goto("/goals");
  const card = goalCard(page, "Monthly spending cap");
  // The card's real progress amount (before " / target"). innerText can repeat the amount
  // (visible + screen-reader copy) on two lines.
  const cardAmount = (await card.getByTestId("goal-amounts").locator(".font-medium").first().innerText())
    .trim()
    .split("\n")[0]
    .trim();

  await card.getByRole("button", { name: "Actions for Monthly spending cap" }).click();
  await page.getByRole("menuitem", { name: "View history" }).click();
  const dialog = page.getByRole("dialog", { name: /Monthly spending cap/ });
  await dialog.getByRole("button", { name: "How the history works" }).click();
  await expect(page.getByRole("tooltip")).toContainText("Past periods keep their final result");

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
