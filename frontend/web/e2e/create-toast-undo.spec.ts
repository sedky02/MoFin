import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// The toast after saving a new transaction offers Undo (soft-deletes it again) and
// View (opens it) for 10 s. Each test removes what it creates, so the fixture's
// balances don't move between runs. Needs the UX fixture: `npm run e2e:seed`.
test.use({ locale: "en-US" });

type Tx = { id: string };

const toCents = (amount: string) => Math.round(Number(amount) * 100);

async function mainAccountId(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/backend/accounts", { params: { limit: 100, offset: 0 } });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: { id: string; name: string }[] };
  const main = body.data.find((a) => a.name === "Main checking");
  expect(main, 'fixture account "Main checking" not found: run `npm run e2e:seed`').toBeTruthy();
  return main!.id;
}

async function balanceCents(request: APIRequestContext, accountId: string): Promise<number> {
  const res = await request.get("/api/backend/ledger/balance", { params: { accountId } });
  expect(res.ok()).toBeTruthy();
  const rows = (await res.json()) as { key: string; balance: string }[];
  return toCents(rows.find((r) => r.key === "USD")?.balance ?? "0");
}

async function searchIds(request: APIRequestContext, q: string): Promise<string[]> {
  const res = await request.get("/api/backend/search/transactions", { params: { q, limit: 20, offset: 0 } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { data: Tx[] }).data.map((t) => t.id);
}

/** Fills and saves the New transaction form (a USD expense on the default account) and returns the new id. */
async function saveNewExpense(page: Page, description: string, amountText: string): Promise<string> {
  await page.goto("/transactions/new");
  await expect(page.getByRole("heading", { level: 1, name: "New transaction" })).toBeVisible();
  const amount = page.getByLabel("Amount in USD").first();
  await expect(amount).toBeVisible();
  await amount.click();
  await amount.pressSequentially(amountText, { delay: 30 });
  await page.getByPlaceholder(/^Description, e\.g\./).fill(description);
  await page.getByRole("button", { name: "Save transaction" }).click();
  await page.waitForURL(/\/transactions\/(?!new)[^/?#]+$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

const createToast = (page: Page) => page.locator("[data-sonner-toast]").filter({ hasText: "Transaction recorded." });

/**
 * Leaves the transaction's page by an in-app link, so the toast (and the page's JS)
 * survives. Not "Back to transactions": that goes back in history, to the New form.
 */
async function leaveByLink(page: Page) {
  await page.getByRole("link", { name: "Goals", exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/goals$/);
}

async function cleanUp(request: APIRequestContext, id: string) {
  // 404 when the test already undid it.
  const res = await request.delete(`/api/backend/transactions/${id}`);
  expect([204, 404]).toContain(res.status());
}

test("Undo on the create toast deletes the new transaction and the balance returns", async ({ page }) => {
  const accountId = await mainAccountId(page.request);
  const description = `Create undo ${Date.now()}`;
  const before = await balanceCents(page.request, accountId);
  const id = await saveNewExpense(page, description, "27");
  try {
    expect(await balanceCents(page.request, accountId)).toBe(before - 2700);
    expect(await searchIds(page.request, description)).toEqual([id]);

    await createToast(page).getByRole("button", { name: "Undo" }).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Transaction removed." })).toBeVisible();

    expect((await page.request.get(`/api/backend/transactions/${id}`)).status()).toBe(404);
    expect(await searchIds(page.request, description)).toEqual([]);
    expect(await balanceCents(page.request, accountId)).toBe(before);

    // Its own page is gone, so the user is not left on a 404.
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByText(description)).toHaveCount(0);
  } finally {
    await cleanUp(page.request, id);
  }
});

test("View on the create toast opens the new transaction", async ({ page }) => {
  const description = `Create view ${Date.now()}`;
  const id = await saveNewExpense(page, description, "4");
  try {
    // Move away from the transaction's page first, then follow the toast back to it.
    await leaveByLink(page);
    await createToast(page).getByRole("button", { name: "View" }).click();
    await expect(page).toHaveURL(new RegExp(`/transactions/${id}$`));
    await expect(page.getByRole("heading", { level: 1, name: description })).toBeVisible();
  } finally {
    await cleanUp(page.request, id);
  }
});

test("Undo still works after navigating away from the form", async ({ page }) => {
  const accountId = await mainAccountId(page.request);
  const description = `Create undo later ${Date.now()}`;
  const before = await balanceCents(page.request, accountId);
  const id = await saveNewExpense(page, description, "13");
  try {
    await leaveByLink(page);
    await createToast(page).getByRole("button", { name: "Undo" }).click();

    await expect.poll(async () => (await page.request.get(`/api/backend/transactions/${id}`)).status()).toBe(404);
    expect(await balanceCents(page.request, accountId)).toBe(before);
    expect(await searchIds(page.request, description)).toEqual([]);
    // Already elsewhere, so the undo leaves the user where they are.
    await expect(page).toHaveURL(/\/goals$/);
  } finally {
    await cleanUp(page.request, id);
  }
});
