import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// B-04: a category picked before a type switch must not be kept (hidden) and
// submitted, and the API must refuse a category of the wrong type.
// Needs the UX fixture: `npm run e2e:seed` ("Main checking" is USD, "Groceries"
// and "Dining out" are expense categories).
test.use({ locale: "en-US" });

type Json = Record<string, unknown>;
type SavedTx = {
  id: string;
  type: string;
  categoryId?: string | null;
  items: { amount: string; categoryId?: string | null }[];
};

async function firstPage(request: APIRequestContext, path: string): Promise<Json[]> {
  const res = await request.get(`/api/backend${path}`, { params: { limit: 100, offset: 0 } });
  expect(res.ok(), `GET ${path} failed with ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { data: Json[] }).data;
}

function typeSwitch(page: Page, label: "Expense" | "Income" | "Transfer") {
  return page.getByRole("radiogroup", { name: "Transaction type" }).getByRole("radio", { name: label });
}

function categoryChips(page: Page) {
  return page.getByRole("radiogroup", { name: "Category" });
}

/** The split row holding item `n` (1-based): amount, category select and row buttons. */
function splitRow(page: Page, n: number) {
  return page.getByRole("button", { name: `Remove item ${n}` }).locator("xpath=..");
}

async function openNewTransaction(page: Page) {
  await page.goto("/transactions/new");
  await expect(page.getByRole("heading", { level: 1, name: "New transaction" })).toBeVisible();
  // The form defaults to "Main checking" (USD), so this label is stable.
  await expect(page.getByLabel("Amount in USD").first()).toBeVisible();
}

/** Saves the form, returns the created transaction as the API stores it, then voids it. */
async function saveAndFetch(page: Page): Promise<SavedTx> {
  await page.getByRole("button", { name: "Save transaction" }).click();
  await page.waitForURL(/\/transactions\/(?!new)[^/?#]+$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;

  const res = await page.request.get(`/api/backend/transactions/${id}`);
  expect(res.ok()).toBeTruthy();
  const tx = (await res.json()) as SavedTx;

  // Void it so repeated runs don't move the fixture's balances.
  const voided = await page.request.post(`/api/backend/transactions/${id}/void`);
  expect(voided.ok(), `void failed with ${voided.status()}`).toBeTruthy();
  return tx;
}

test.describe("category on type switch", () => {
  test("expense category is dropped when switching to Income", async ({ page }) => {
    await openNewTransaction(page);

    const amount = page.getByLabel("Amount in USD");
    await amount.click();
    await amount.pressSequentially("12.34", { delay: 30 });
    await page.getByPlaceholder(/^Description, e\.g\./).fill(`Type switch check ${Date.now()}`);

    const groceries = categoryChips(page).getByRole("radio", { name: /Groceries/ });
    await groceries.click();
    await expect(groceries).toHaveAttribute("aria-checked", "true");

    await typeSwitch(page, "Income").click();
    await expect(typeSwitch(page, "Income")).toHaveAttribute("aria-checked", "true");
    // Only income categories are listed now, and none of them is picked.
    await expect(categoryChips(page).getByRole("radio", { name: /Groceries/ })).toHaveCount(0);
    await expect(categoryChips(page).locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);

    // Switching back doesn't bring the old pick back either.
    await typeSwitch(page, "Expense").click();
    await expect(categoryChips(page).getByRole("radio", { name: /Groceries/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await typeSwitch(page, "Income").click();

    const tx = await saveAndFetch(page);
    expect(tx.type).toBe("INCOME");
    expect(tx.categoryId ?? null).toBeNull();
    for (const item of tx.items) expect(item.categoryId ?? null).toBeNull();
  });

  test("split rows lose their expense categories when switching to Income", async ({ page }) => {
    await openNewTransaction(page);

    const amount = page.getByLabel("Amount in USD").first();
    await amount.click();
    await amount.pressSequentially("30", { delay: 30 });
    await page.getByPlaceholder(/^Description, e\.g\./).fill(`Split type switch check ${Date.now()}`);
    await categoryChips(page).getByRole("radio", { name: /Groceries/ }).click();

    // Row 1 takes the amount and the Groceries pick; row 2 gets its own category.
    await page.getByRole("button", { name: "Split transaction" }).click();
    await expect(splitRow(page, 1).getByRole("combobox")).toContainText("Groceries");

    const row2Amount = page.getByLabel("Item 2 amount");
    await row2Amount.click();
    await row2Amount.pressSequentially("10", { delay: 30 });
    await splitRow(page, 2).getByRole("combobox").click();
    await page.getByRole("option", { name: /Dining out/ }).click();
    await expect(splitRow(page, 2).getByRole("combobox")).toContainText("Dining out");

    await typeSwitch(page, "Income").click();
    await expect(typeSwitch(page, "Income")).toHaveAttribute("aria-checked", "true");
    for (const n of [1, 2]) {
      await expect(splitRow(page, n).getByRole("combobox")).toContainText("Uncategorized");
    }

    const tx = await saveAndFetch(page);
    expect(tx.type).toBe("INCOME");
    expect(tx.categoryId ?? null).toBeNull();
    expect(tx.items).toHaveLength(2);
    for (const item of tx.items) expect(item.categoryId ?? null).toBeNull();
  });

  test("the API refuses a category of the wrong type, and any category on a transfer", async ({ page }) => {
    const categories = await firstPage(page.request, "/categories");
    const groceries = categories.find((c) => c.name === "Groceries" && c.type === "EXPENSE");
    expect(groceries, "fixture category Groceries not found: run `npm run e2e:seed`").toBeTruthy();

    const accounts = await firstPage(page.request, "/accounts");
    const main = accounts.find((a) => a.name === "Main checking");
    const other = accounts.find((a) => a.name !== "Main checking" && a.currency === "USD");
    expect(main && other, "fixture accounts not found: run `npm run e2e:seed`").toBeTruthy();

    const base = {
      description: `Wrong category ${Date.now()}`,
      amount: "5.00",
      currency: "USD",
      occurredAt: new Date().toISOString(),
      categoryId: groceries!.id,
    };

    const income = await page.request.post("/api/backend/transactions", {
      data: { ...base, type: "INCOME", toAccountId: main!.id },
    });
    expect(income.status()).toBe(400);
    expect(JSON.stringify(await income.json())).toContain("is an expense category");

    const transfer = await page.request.post("/api/backend/transactions", {
      data: { ...base, type: "TRANSFER", fromAccountId: main!.id, toAccountId: other!.id },
    });
    expect(transfer.status()).toBe(400);
    expect(JSON.stringify(await transfer.json())).toContain("Transfers cannot have a category");
  });
});
