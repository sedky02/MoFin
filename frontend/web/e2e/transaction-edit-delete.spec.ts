import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// Transactions can be edited and soft-deleted (with Undo). Each test records its own expense on the
// fixture's USD account and deletes it; needs `npm run e2e:seed`.
test.use({ locale: "en-US" });

// The dev-only Next indicator and query devtools sit bottom-left, over the mobile bar,
// and axe would count them against its targets.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, .tsqd-parent-container { display: none !important; }";
      document.head.append(style);
    });
  });
});

type Tx = { id: string; description: string; occurredAt: string; items: { amount: string }[] };

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

async function expenseCents(request: APIRequestContext): Promise<number> {
  const now = new Date();
  const res = await request.get("/api/backend/analytics/monthly-summary", {
    params: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, currency: "USD", refresh: "true" },
  });
  expect(res.ok()).toBeTruthy();
  return toCents(((await res.json()) as { expenses: string }).expenses);
}

async function searchIds(request: APIRequestContext, q: string): Promise<string[]> {
  const res = await request.get("/api/backend/search/transactions", { params: { q, limit: 20, offset: 0 } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { data: Tx[] }).data.map((t) => t.id);
}

async function recordExpense(request: APIRequestContext, accountId: string, description: string, amount: string): Promise<Tx> {
  const res = await request.post("/api/backend/transactions", {
    data: {
      type: "EXPENSE",
      description,
      amount,
      currency: "USD",
      occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      fromAccountId: accountId,
    },
  });
  expect(res.ok(), `create failed with ${res.status()}`).toBeTruthy();
  return (await res.json()) as Tx;
}

async function cleanUp(request: APIRequestContext, id: string) {
  // 404 when the test already deleted it.
  const res = await request.delete(`/api/backend/transactions/${id}`);
  expect([204, 404]).toContain(res.status());
}

async function expectNoAxeViolations(page: Page, label: string) {
  const violations = await runAxe(page);
  const report = formatViolations(violations);
  await test.info().attach(`axe ${label}`, { body: report || "no violations", contentType: "text/plain" });
  expect(violations, `axe violations on ${label}\n${report}`).toEqual([]);
}

test("editing an expense prefills the form and moves the balance by exactly the difference", async ({ page }) => {
  const accountId = await mainAccountId(page.request);
  const description = `Edit check ${Date.now()}`;
  const tx = await recordExpense(page.request, accountId, description, "50.00");
  try {
    const before = await balanceCents(page.request, accountId);

    await page.goto(`/transactions/${tx.id}`);
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(new RegExp(`/transactions/${tx.id}/edit$`));
    await expect(page.getByRole("heading", { level: 1, name: "Edit transaction" })).toBeVisible();
    const amount = page.getByLabel("Amount in USD");
    await expect(amount).toHaveValue("50.00");
    await expect(page.getByPlaceholder(/^Description/)).toHaveValue(description);
    await expect(page.getByRole("radio", { name: "Expense" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Repeat this transaction")).toHaveCount(0);
    await expectNoAxeViolations(page, "edit transaction");

    await amount.fill("72.25");
    await amount.blur();
    await page.getByPlaceholder(/^Description/).fill(`${description} (fixed)`);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(new RegExp(`/transactions/${tx.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: `${description} (fixed)` })).toBeVisible();
    const saved = (await (await page.request.get(`/api/backend/transactions/${tx.id}`)).json()) as Tx;
    expect(saved.items.map((i) => toCents(i.amount))).toEqual([7225]);
    // 22.25 more spent: the balance drops by exactly that, not by a second 72.25.
    expect(await balanceCents(page.request, accountId)).toBe(before - 2225);
  } finally {
    await cleanUp(page.request, tx.id);
  }
});

test("deleting takes a transaction out of balances, summaries and search, and Undo puts it back", async ({ page }) => {
  const accountId = await mainAccountId(page.request);
  const description = `Delete check ${Date.now()}`;
  const baseline = { balance: await balanceCents(page.request, accountId), expenses: await expenseCents(page.request) };
  const tx = await recordExpense(page.request, accountId, description, "41.10");
  try {
    expect(await balanceCents(page.request, accountId)).toBe(baseline.balance - 4110);

    await page.goto(`/transactions/${tx.id}`);
    await page.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(dialog.getByText("It's removed from your balances, summaries and goals.")).toBeVisible();
    await expectNoAxeViolations(page, "delete dialog");
    await dialog.getByRole("button", { name: "Delete transaction" }).click();

    await expect(page).toHaveURL(/\/transactions$/);
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Transaction deleted." });
    await expect(toast).toBeVisible();

    expect((await page.request.get(`/api/backend/transactions/${tx.id}`)).status()).toBe(404);
    expect(await balanceCents(page.request, accountId)).toBe(baseline.balance);
    expect(await expenseCents(page.request)).toBe(baseline.expenses);
    expect(await searchIds(page.request, description)).toEqual([]);

    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(page).toHaveURL(new RegExp(`/transactions/${tx.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: description })).toBeVisible();
    expect(await balanceCents(page.request, accountId)).toBe(baseline.balance - 4110);
    expect(await expenseCents(page.request)).toBe(baseline.expenses + 4110);
    expect(await searchIds(page.request, description)).toEqual([tx.id]);
  } finally {
    await cleanUp(page.request, tx.id);
  }
  expect(await balanceCents(page.request, accountId)).toBe(baseline.balance);
});

test("the detail page has no void action any more", async ({ page }) => {
  const accountId = await mainAccountId(page.request);
  const tx = await recordExpense(page.request, accountId, `Legacy action check ${Date.now()}`, "3.00");
  try {
    await page.goto(`/transactions/${tx.id}`);
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.getByText(/void/i)).toHaveCount(0);
    expect((await page.request.post(`/api/backend/transactions/${tx.id}/void`)).status()).toBe(404);
  } finally {
    await cleanUp(page.request, tx.id);
  }
});

test("a recurring series keeps its type, and a transaction on an archived account can't be edited", async ({ page }) => {
  const find = async (q: string, pick: (t: Tx & { isRecurring?: boolean; parentTransactionId?: string | null }) => boolean) => {
    const res = await page.request.get("/api/backend/search/transactions", { params: { q, limit: 20, offset: 0 } });
    const found = ((await res.json()) as { data: (Tx & { isRecurring?: boolean; parentTransactionId?: string | null })[] }).data.find(pick);
    expect(found, `fixture transaction "${q}" not found: run \`npm run e2e:seed\``).toBeTruthy();
    return found!;
  };

  const rent = await find("Rent (monthly)", (t) => !!t.isRecurring && !t.parentTransactionId);
  await page.goto(`/transactions/${rent.id}/edit`);
  await expect(page.getByText("A recurring series keeps its type and currency.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Income" })).toBeDisabled();
  await expect(page.getByLabel("Amount in TND")).toHaveValue("12.345");
  await expect(page.getByRole("button", { name: "Split transaction" })).toHaveCount(0);

  const archived = await find("Old savings opening deposit", () => true);
  await page.goto(`/transactions/${archived.id}/edit`);
  await expect(page.getByText("This transaction is on an archived account")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
});
