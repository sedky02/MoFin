import { expect, test, type Locator, type Page } from "@playwright/test";

// The list lives at /transactions (/search redirects), filters by type, recurrence and archived
// accounts, sorts, and names each row's account. Needs `npm run e2e:seed`.
test.use({ locale: "en-US" });

type Tx = {
  id: string;
  description: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  isRecurring: boolean;
  parentTransactionId?: string | null;
};

async function searchApi(page: Page, params: Record<string, string>): Promise<{ data: Tx[]; total: number }> {
  const res = await page.request.get("/api/backend/search/transactions", {
    params: { limit: "100", offset: "0", ...params },
  });
  expect(res.ok(), `search failed with ${res.status()}: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as { data: Tx[]; total: number };
}

const rows = (page: Page): Locator => page.locator('main a[href^="/transactions/"]:not([href="/transactions/new"])');

function row(page: Page, description: string): Locator {
  const escaped = description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return rows(page).filter({ has: page.getByText(new RegExp(`^${escaped}$`)) });
}

/** Waits for the list to finish loading: the results footer (not "updating…") or the empty state. */
async function settled(page: Page) {
  const footer = page.locator("main p[role=status]");
  await expect(footer.or(page.getByText(/^No transactions (match|yet)$/))).toBeVisible({ timeout: 15_000 });
  // No footer at all on the empty state.
  if (await footer.isVisible()) await expect(footer).not.toContainText("updating");
}

async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^More filters/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

async function choose(page: Page, field: string, option: string) {
  await openFilters(page);
  await page.getByRole("combobox", { name: field, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("/transactions is the Transactions page", async ({ page }) => {
  const response = await page.goto("/transactions");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Transactions");
  await expect(page).toHaveTitle(/^Transactions · /);
  // The search field heads the page.
  await expect(page.getByRole("textbox", { name: "Search transactions" })).toBeVisible();
  await settled(page);
  await expect(rows(page).first()).toBeVisible();
});

test("/search redirects to /transactions and keeps the query string", async ({ page }) => {
  const res = await page.request.get("/search?q=x", { maxRedirects: 0 });
  expect([307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toMatch(/^(https?:\/\/[^/]+)?\/transactions\?q=x$/);

  await page.goto("/search?q=Rent");
  await expect(page).toHaveURL(/\/transactions\?q=Rent$/);
  await expect(page.getByRole("textbox", { name: "Search transactions" })).toHaveValue("Rent");
});

test("Transactions stays the current nav item on a transaction's page", async ({ page }, testInfo) => {
  const { data } = await searchApi(page, { q: "Groceries run" });
  expect(data.length, "no fixture transactions: run `npm run e2e:seed`").toBeGreaterThan(0);
  await page.goto(`/transactions/${data[0].id}`);

  const navName = testInfo.project.name === "mobile" ? "Primary mobile" : "Primary";
  const nav = page.getByRole("navigation", { name: navName, exact: true });
  await expect(nav.getByRole("link", { name: "Transactions", exact: true })).toHaveAttribute("aria-current", "page");
  // Only one item is current: not the add form as well.
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
});

test("the type filter narrows the list, and transfer rows name both accounts", async ({ page }) => {
  await page.goto("/transactions?limit=50");
  await settled(page);
  await choose(page, "Type", "Transfer");
  await expect(page).toHaveURL(/[?&]type=TRANSFER(&|$)/);
  await settled(page);

  await expect(row(page, "Emergency fund transfer").first()).toContainText("Main checking → Emergency fund");
  await expect(row(page, "Groceries run")).toHaveCount(0);
  await expect(row(page, "Monthly salary")).toHaveCount(0);
  for (const text of await rows(page).allInnerTexts()) expect(text).toContain("→");

  // Same through the API: transfers only, fewer than the whole list.
  const all = await searchApi(page, {});
  const transfers = await searchApi(page, { type: "TRANSFER" });
  expect(transfers.data.length).toBeGreaterThanOrEqual(5);
  expect(transfers.data.every((t) => t.type === "TRANSFER")).toBe(true);
  expect(transfers.total).toBeLessThan(all.total);
  const income = await searchApi(page, { type: "INCOME" });
  expect(income.data.every((t) => t.type === "INCOME")).toBe(true);
  expect(income.data.some((t) => t.description === "Monthly salary")).toBe(true);
});

test("the recurring filter splits series from one-off transactions", async ({ page }) => {
  await page.goto("/transactions?q=Rent");
  await settled(page);
  await expect(row(page, "Rent (monthly)").first()).toBeVisible();

  await choose(page, "Recurring", "One-off only");
  await expect(page).toHaveURL(/[?&]recurrence=one-off(&|$)/);
  await settled(page);
  await expect(row(page, "Rent (monthly)")).toHaveCount(0);

  await choose(page, "Recurring", "Recurring only");
  await expect(page).toHaveURL(/[?&]recurrence=recurring(&|$)/);
  await settled(page);
  const rent = row(page, "Rent (monthly)").first();
  await expect(rent).toBeVisible();
  await expect(rent).toContainText("Dinar");
  await expect(rent.getByLabel("Recurring")).toBeVisible();

  await page.goto("/transactions?q=Groceries%20run&recurrence=recurring");
  await settled(page);
  await expect(row(page, "Groceries run")).toHaveCount(0);
  await page.goto("/transactions?q=Groceries%20run&recurrence=one-off");
  await settled(page);
  await expect(row(page, "Groceries run")).toHaveCount(5);

  const recurring = await searchApi(page, { recurrence: "recurring" });
  expect(recurring.data.length).toBeGreaterThan(0);
  expect(recurring.data.every((t) => t.isRecurring || !!t.parentTransactionId)).toBe(true);
  const oneOff = await searchApi(page, { recurrence: "one-off" });
  expect(oneOff.data.every((t) => !t.isRecurring && !t.parentTransactionId)).toBe(true);
});

test("every row names its account", async ({ page }) => {
  for (const [description, account] of [
    ["Groceries run", "Main checking"],
    ["Rent (monthly)", "Dinar"],
    ["Souvenirs", "Travel wallet"],
  ]) {
    await page.goto(`/transactions?q=${encodeURIComponent(description)}`);
    await settled(page);
    await expect(row(page, description).first()).toContainText(account);
  }
});

test("sorting by amount orders the rows by their totals", async ({ page }) => {
  const amounts = async () =>
    (await rows(page).allInnerTexts()).map((t) => t.match(/\$([\d,]+\.\d{2})/)?.[1]).filter(Boolean);

  await page.goto("/transactions?q=Groceries%20run");
  await settled(page);
  await choose(page, "Sort by", "Amount: high to low");
  await expect(page).toHaveURL(/[?&]sort=amount-desc(&|$)/);
  await settled(page);
  await expect.poll(amounts).toEqual(["208.50", "201.50", "194.50", "187.50", "180.50"]);

  await choose(page, "Sort by", "Amount: low to high");
  await expect(page).toHaveURL(/[?&]sort=amount-asc(&|$)/);
  await settled(page);
  await expect.poll(amounts).toEqual(["180.50", "187.50", "194.50", "201.50", "208.50"]);
});

test("a deleted transaction never appears, whatever the filters", async ({ page }) => {
  const DELETED = "Duplicate charge (deleted)";
  for (const qs of ["", "&type=EXPENSE", "&recurrence=one-off", "&sort=amount-desc", "&sort=oldest"]) {
    await page.goto(`/transactions?q=${encodeURIComponent("Duplicate charge")}${qs}`);
    await settled(page);
    await expect(row(page, DELETED), `with "${qs || "no filters"}"`).toHaveCount(0);
  }
  const variants: Record<string, string>[] = [{}, { sort: "amount-desc" }, { type: "EXPENSE" }, { recurrence: "one-off" }];
  for (const params of variants) {
    const { data } = await searchApi(page, { q: "Duplicate charge", ...params });
    expect(data.map((t) => t.description)).not.toContain(DELETED);
  }
});

test("filtering by an archived account returns its transactions", async ({ page }) => {
  await page.goto("/transactions");
  await settled(page);
  await choose(page, "Account", "Old savings (archived)");
  await expect(page).toHaveURL(/[?&]accountId=[^&]+/);
  await settled(page);

  const deposit = row(page, "Old savings opening deposit").first();
  await expect(deposit).toBeVisible();
  await expect(deposit).toContainText("Old savings");
  await expect(row(page, "Groceries run")).toHaveCount(0);
});
