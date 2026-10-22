import { expect, test, type Locator, type Page } from "@playwright/test";

// B-05: a split's categories live on its lines. The transaction itself carries none (the
// API refuses one), the monthly summary files every line under its own category (a blank
// line under "Uncategorized", never under the pre-split pick), the search category filter
// finds a split by any of its lines, and its row reads "Split · N categories".
// The first group uses the UX fixture (`npm run e2e:seed`): "Supermarket and pharmacy
// receipt" is split 71.30 Groceries / 25.00 Utilities this month. The second sets up its
// own user and splits a transaction through the form after picking a category first.

test.use({ locale: "en-US" });

const ACTIVE_ACCOUNT_COOKIE = "mofin-active-account";
const FIXTURE_SPLIT = "Supermarket and pharmacy receipt";

type Category = { id: string; name: string; type: string };
type Item = { amount: string; currency: string; categoryId?: string | null; category?: Category | null };
type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  description: string;
  occurredAt: string;
  categoryId?: string | null;
  category?: Category | null;
  items: Item[];
};
type Summary = { categoryBreakdown: { category: string; amount: string }[] };

/** Amount in thousandths, so decimal amounts add up exactly. */
const toMilli = (amount: string) => Math.round(Number(amount) * 1000);

async function api(page: Page, method: "GET" | "POST" | "DELETE", path: string, data?: unknown) {
  const res = await page.request.fetch(`/api/backend${path}`, { method, data });
  expect(res.ok(), `${method} ${path} failed with ${res.status()}: ${await res.text()}`).toBeTruthy();
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

/** UTC bounds of the current calendar month (the API's month). */
function thisMonth() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 };
}

/** Every transaction this month matching `params`, through the BFF. */
async function search(page: Page, params: Record<string, string> = {}): Promise<Tx[]> {
  const { start, end } = thisMonth();
  const out: Tx[] = [];
  for (let offset = 0; ; offset += 100) {
    const body = (await api(
      page,
      "GET",
      `/search/transactions?${new URLSearchParams({
        from: start.toISOString(),
        to: new Date(end.getTime() - 1).toISOString(),
        limit: "100",
        offset: String(offset),
        ...params,
      })}`,
    )) as { data: Tx[]; total: number };
    out.push(...body.data);
    if (body.data.length < 100 || out.length >= body.total) break;
  }
  return out;
}

/** This month's all-accounts expense breakdown in `currency`, by category name, in thousandths. */
async function expenseBreakdown(page: Page, currency: string): Promise<Map<string, number>> {
  const { year, month } = thisMonth();
  const summary = (await api(
    page,
    "GET",
    `/analytics/monthly-summary?${new URLSearchParams({ year: String(year), month: String(month), currency, refresh: "true" })}`,
  )) as Summary;
  return new Map(summary.categoryBreakdown.map((c) => [c.category, toMilli(c.amount)]));
}

/**
 * What each category's expense total should be, read from the transactions themselves:
 * a split line counts under its own category (or Uncategorized), and only an unsplit
 * transaction falls back to its own category.
 */
function expectedBreakdown(transactions: Tx[], currency: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== "EXPENSE") continue;
    const split = tx.items.length > 1;
    for (const item of tx.items) {
      if (item.currency !== currency) continue;
      const name = item.category?.name ?? (split ? null : tx.category?.name) ?? "Uncategorized";
      totals.set(name, (totals.get(name) ?? 0) + toMilli(item.amount));
    }
  }
  return totals;
}

/** The search/recent-list row for the transaction described exactly `description`. */
function row(page: Page, description: string): Locator {
  const escaped = description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByRole("link", { name: new RegExp(`^${escaped}`) });
}

test.describe("split categories (UX fixture)", () => {
  test("the fixture split is filed under each line's category, and search finds it by either", async ({ page }) => {
    const categories = ((await api(page, "GET", "/categories?limit=100&offset=0")) as { data: Category[] }).data;
    const groceries = categories.find((c) => c.name === "Groceries" && c.type === "EXPENSE");
    const utilities = categories.find((c) => c.name === "Utilities" && c.type === "EXPENSE");
    expect(groceries && utilities, "fixture categories not found: run `npm run e2e:seed`").toBeTruthy();

    const month = await search(page);
    const split = month.find((t) => t.description === FIXTURE_SPLIT);
    expect(split, "fixture split not found this month: run `npm run e2e:seed`").toBeTruthy();
    // The split carries no category of its own; each line has one.
    expect(split!.categoryId ?? null).toBeNull();
    expect(split!.items.map((i) => [i.categoryId, toMilli(i.amount)])).toEqual(
      expect.arrayContaining([
        [groceries!.id, 71_300],
        [utilities!.id, 25_000],
      ]),
    );

    // The summary's per-category totals are exactly the lines filed under each category.
    const actual = await expenseBreakdown(page, "USD");
    const expected = expectedBreakdown(month, "USD");
    for (const name of ["Groceries", "Utilities"]) {
      expect(actual.get(name), `${name} in the monthly summary`).toBe(expected.get(name));
    }
    expect(actual.get("Groceries")).toBeGreaterThanOrEqual(71_300);
    expect(actual.get("Utilities")).toBeGreaterThanOrEqual(25_000);

    // Searching by either line's category finds the split.
    for (const category of [groceries!, utilities!]) {
      const found = await search(page, { categoryId: category.id });
      expect(found.map((t) => t.id), `search by ${category.name}`).toContain(split!.id);
    }

    // And its row in the search results names the split, not one stale category.
    await page.goto(`/search?q=${encodeURIComponent("Supermarket")}&categoryId=${utilities!.id}`);
    await expect(row(page, FIXTURE_SPLIT).first()).toContainText("Split · 2 categories");
  });
});

test.describe("split categories (split after picking a category)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const EMAIL = "b05-split-category@mofin.test";
  const PASSWORD = "SplitCategory#2026";
  const ACCOUNT = "B05 Checking";
  const CATEGORY = "B05 Groceries";
  const PREFIX = "B05 receipt";

  /**
   * Idempotent: signs in (registering on first run), makes sure the USD account and the
   * expense category exist, and voids the receipts earlier runs left, so this run's split
   * is the only spending the month's summary counts.
   */
  async function setUp(page: Page, baseURL: string | undefined) {
    await page.request.post("/api/auth/register", { data: { email: EMAIL, password: PASSWORD, displayName: "B05" } });
    const login = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    expect(login.ok(), `login failed with ${login.status()}`).toBeTruthy();

    const accounts = (await api(page, "GET", "/accounts?status=all&limit=100&offset=0")) as {
      data: { id: string; name: string }[];
    };
    const account =
      accounts.data.find((a) => a.name === ACCOUNT) ??
      (await api(page, "POST", "/accounts", { name: ACCOUNT, type: "BANK", currency: "USD" }));

    const categories = ((await api(page, "GET", "/categories?limit=100&offset=0")) as { data: Category[] }).data;
    const category: Category =
      categories.find((c) => c.name === CATEGORY) ??
      (await api(page, "POST", "/categories", { name: CATEGORY, type: "EXPENSE" }));

    for (const tx of await search(page, { q: PREFIX })) {
      await api(page, "DELETE", `/transactions/${tx.id}`);
    }

    await page
      .context()
      .addCookies([{ name: ACTIVE_ACCOUNT_COOKIE, value: "all", url: baseURL ?? "http://localhost:3001" }]);
    await page.addInitScript((key) => localStorage.setItem(key, "all"), ACTIVE_ACCOUNT_COOKIE);
    return { account: account as { id: string }, category };
  }

  test("the API refuses a split that also has its own category", async ({ page, baseURL }) => {
    const { account, category } = await setUp(page, baseURL);

    const res = await page.request.post("/api/backend/transactions", {
      data: {
        type: "EXPENSE",
        description: `${PREFIX} refused ${Date.now()}`,
        amount: "50.00",
        currency: "USD",
        occurredAt: new Date().toISOString(),
        fromAccountId: account.id,
        categoryId: category.id,
        items: [
          { amount: "30.00", categoryId: category.id },
          { amount: "20.00" },
        ],
      },
    });
    expect(res.status()).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("A split transaction cannot have its own category");
  });

  test("the pre-split pick moves to the first line, and a blank line counts as Uncategorized", async ({
    page,
    baseURL,
  }) => {
    const { category } = await setUp(page, baseURL);
    const description = `${PREFIX} ${Date.now()}`;

    await page.goto("/transactions/new");
    await expect(page.getByRole("heading", { level: 1, name: "New transaction" })).toBeVisible();
    const amount = page.getByLabel("Amount in USD").first();
    await expect(amount).toBeVisible();
    await amount.click();
    await amount.pressSequentially("30", { delay: 30 });
    await page.getByPlaceholder(/^Description, e\.g\./).fill(description);
    await page.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name: new RegExp(CATEGORY) }).click();

    // Line 1 takes the amount and the pick; line 2 is left without a category.
    await page.getByRole("button", { name: "Split transaction" }).click();
    const line = (n: number) => page.getByRole("button", { name: `Remove item ${n}` }).locator("xpath=..");
    await expect(line(1).getByRole("combobox")).toContainText(CATEGORY);
    await expect(line(2).getByRole("combobox")).toContainText("Uncategorized");
    const line2Amount = page.getByLabel("Item 2 amount");
    await line2Amount.click();
    await line2Amount.pressSequentially("20", { delay: 30 });

    await page.getByRole("button", { name: "Save transaction" }).click();
    await page.waitForURL(/\/transactions\/(?!new)[^/?#]+$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;

    const saved = (await api(page, "GET", `/transactions/${id}`)) as Tx;
    expect(saved.categoryId ?? null).toBeNull();
    expect(saved.items.map((i) => [i.categoryId ?? null, toMilli(i.amount)])).toEqual(
      expect.arrayContaining([
        [category.id, 30_000],
        [null, 20_000],
      ]),
    );

    // Before the fix the whole 50 landed under the pre-split pick.
    const breakdown = await expenseBreakdown(page, "USD");
    expect(breakdown.get(CATEGORY)).toBe(30_000);
    expect(breakdown.get("Uncategorized")).toBe(20_000);

    // The dashboard's summary card shows the same split, and the recent list names it.
    await page.goto("/dashboard");
    const card = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: "Monthly summary" }) });
    for (const [name, value] of [
      [CATEGORY, 30_000],
      ["Uncategorized", 20_000],
    ] as const) {
      const entry = card.getByRole("listitem").filter({ hasText: name });
      await expect(entry).toHaveCount(1);
      await expect
        .poll(async () => {
          const title = await entry.locator("span[title]").first().getAttribute("title");
          return title ? toMilli(title.replace(/[^0-9.-]/g, "")) : null;
        }, { message: `${name} in the summary card` })
        .toBe(value);
    }
    await expect(row(page, description).first()).toContainText("Split · 2 categories");
  });
});
