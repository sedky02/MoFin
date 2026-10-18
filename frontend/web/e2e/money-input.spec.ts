import { expect, test } from "@playwright/test";

// B-01: a thousands separator typed into the amount must not be read as a
// decimal comma. Needs the seeded fixture ("Main checking" is a USD account).
test.use({ locale: "en-US" });

test("typing 1,234 in New transaction saves 1234.00", async ({ page }) => {
  const description = `Separator check ${Date.now()}`;

  await page.goto("/transactions/new");
  await expect(page.getByRole("heading", { level: 1, name: "New transaction" })).toBeVisible();

  // Pin the account so the currency (and so the decimals) is known.
  await page.getByRole("combobox", { name: "Account" }).click();
  await page.getByRole("option", { name: /Main checking/ }).click();

  const amount = page.getByLabel("Amount in USD");
  await amount.click();
  await amount.pressSequentially("1,234", { delay: 30 });

  // Kept exactly as typed, with the reading shown before submit.
  await expect(amount).toHaveValue("1,234");
  await expect(page.getByText("= 1,234.00", { exact: true })).toBeVisible();

  await page.getByPlaceholder(/^Description, e\.g\./).fill(description);
  await expect(amount).toHaveValue("1234.00"); // tidied on blur

  await page.getByRole("button", { name: "Save transaction" }).click();
  await page.waitForURL(/\/transactions\/(?!new)[^/?#]+$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;

  // Detail page: the summary card shows the full amount.
  await expect(page.getByRole("heading", { level: 1, name: description })).toBeVisible();
  // MoneyAmount puts the full formatted value in its title.
  await expect(page.getByTitle("-$1,234.00", { exact: true }).first()).toBeVisible();

  // And the ledger holds 1234, not 1.23.
  const res = await page.request.get(`/api/backend/transactions/${id}`);
  expect(res.ok()).toBeTruthy();
  const tx = (await res.json()) as { currency: string; items: { amount: string }[] };
  expect(tx.currency).toBe("USD");
  expect(tx.items).toHaveLength(1);
  expect(tx.items[0].amount).toMatch(/^1234(\.0+)?$/);

  // Void it so repeated runs don't move the fixture's balances.
  const voided = await page.request.post(`/api/backend/transactions/${id}/void`);
  expect(voided.ok(), `void failed with ${voided.status()}`).toBeTruthy();
});
