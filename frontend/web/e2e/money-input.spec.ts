import { expect, test } from "@playwright/test";

// A thousands separator in the amount isn't read as a decimal comma. Needs `npm run e2e:seed`
// ("Main checking" is USD).
test.use({ locale: "en-US" });

test("typing 1,234 in New transaction saves 1234.00", async ({ page }) => {
  const description = `Separator check ${Date.now()}`;

  await page.goto("/transactions/new");
  await expect(page.getByRole("heading", { level: 1, name: "New transaction" })).toBeVisible();

  // The form defaults to the fixture's main account (USD), so the decimals are known without
  // opening the select.
  const amount = page.getByLabel("Amount in USD");
  await expect(amount).toBeVisible();
  await amount.click();
  await amount.pressSequentially("1,234", { delay: 30 });

  await expect(amount).toHaveValue("1,234");
  await expect(page.getByText("= 1,234.00", { exact: true })).toBeVisible();

  await page.getByPlaceholder(/^Description, e\.g\./).fill(description);
  await expect(amount).toHaveValue("1234.00");

  await page.getByRole("button", { name: "Save transaction" }).click();
  await page.waitForURL(/\/transactions\/(?!new)[^/?#]+$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;

  await expect(page.getByRole("heading", { level: 1, name: description })).toBeVisible();
  await expect(page.getByTitle("-$1,234.00", { exact: true }).first()).toBeVisible();

  const res = await page.request.get(`/api/backend/transactions/${id}`);
  expect(res.ok()).toBeTruthy();
  const tx = (await res.json()) as { currency: string; items: { amount: string }[] };
  expect(tx.currency).toBe("USD");
  expect(tx.items).toHaveLength(1);
  expect(tx.items[0].amount).toMatch(/^1234(\.0+)?$/);

  // Delete it so repeated runs don't move the fixture's balances.
  const deleted = await page.request.delete(`/api/backend/transactions/${id}`);
  expect(deleted.ok(), `delete failed with ${deleted.status()}`).toBeTruthy();
});
