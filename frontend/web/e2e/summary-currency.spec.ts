import { expect, test, type Locator, type Page } from "@playwright/test";

// An all-accounts summary never adds currencies together and its switch lists every currency active
// that month, archived included. First group needs `npm run e2e:seed`.

test.use({ locale: "en-US" });

const ACTIVE_ACCOUNT_COOKIE = "mofin-active-account";

type SearchTx = {
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  description: string;
  occurredAt: string;
  items: { amount: string; currency: string }[];
};

/** Amount in thousandths, so 3-decimal currencies add up exactly. */
const toMilli = (amount: string) => Math.round(Number(amount) * 1000);

/** UTC bounds of the calendar month `offset` months before the current one (the API's month). */
function monthBounds(offset: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - offset, 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() - offset + 1, 1));
  return { start, end };
}

async function transactionsIn(page: Page, start: Date, end: Date): Promise<SearchTx[]> {
  const out: SearchTx[] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await page.request.get("/api/backend/search/transactions", {
      params: { from: start.toISOString(), to: end.toISOString(), limit: 100, offset },
    });
    expect(res.ok(), `search failed with ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { data: SearchTx[]; total: number };
    out.push(...body.data);
    if (body.data.length < 100 || out.length >= body.total) break;
  }
  // Search, like the summary, leaves deleted transactions out.
  return out.filter((t) => new Date(t.occurredAt) < end);
}

function totalsByCurrency(transactions: SearchTx[]) {
  const totals = new Map<string, { income: number; expenses: number }>();
  for (const tx of transactions) {
    if (tx.type === "TRANSFER") continue;
    for (const item of tx.items) {
      const t = totals.get(item.currency) ?? { income: 0, expenses: 0 };
      if (tx.type === "INCOME") t.income += toMilli(item.amount);
      else t.expenses += toMilli(item.amount);
      totals.set(item.currency, t);
    }
  }
  return totals;
}

function currencySymbol(currency: string) {
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

function summaryCard(page: Page) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Monthly summary" }) });
}

function stripAmount(card: Locator, label: "Income" | "Expenses") {
  return card.locator(`xpath=.//dt[normalize-space()='${label}']/following-sibling::dd[1]//span[@title]`);
}

async function readMilli(amount: Locator): Promise<number | null> {
  const title = await amount.getAttribute("title", { timeout: 1000 }).catch(() => null);
  return title ? toMilli(title.replace(/[^0-9.-]/g, "")) : null;
}

function monthLabel(offset: number) {
  return monthBounds(offset).start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

async function switchOptions(page: Page, card: Locator): Promise<string[]> {
  const trigger = card.getByRole("combobox", { name: "Currency" });
  if ((await trigger.count()) === 0) return [];
  const options = page.getByRole("option");
  // The option list is rebuilt when the month's `activeCurrencies` arrive, which can close an
  // open select, so retry the open until it stays up.
  await expect(async () => {
    await trigger.click();
    await expect(options.first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  const codes = (await options.allInnerTexts()).map((text) => text.trim().slice(0, 3));
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
  return codes;
}

async function selectCurrency(page: Page, card: Locator, code: string) {
  const trigger = card.getByRole("combobox", { name: "Currency" });
  await trigger.click();
  await page.getByRole("option", { name: new RegExp(`^${code}`) }).click();
  await expect(trigger).toContainText(code);
}

async function showAllAccounts(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([{ name: ACTIVE_ACCOUNT_COOKIE, value: "all", url: baseURL ?? "http://localhost:3001" }]);
  await page.addInitScript((key) => localStorage.setItem(key, "all"), ACTIVE_ACCOUNT_COOKIE);
}

function recordSummaryRequests(page: Page) {
  const urls: URL[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/analytics/monthly-summary")) urls.push(new URL(req.url()));
  });
  return urls;
}

/**
 * For the month `offset` months back: the switch lists every currency with activity that
 * month, and for each of them the strip shows that currency's totals only.
 */
async function expectSummaryMatchesTransactions(page: Page, card: Locator, offset: number) {
  const { start, end } = monthBounds(offset);
  const totals = totalsByCurrency(await transactionsIn(page, start, end));

  // The month's data is in (its activeCurrencies feed the switch) before the switch is read.
  await expect(card).toContainText(monthLabel(offset));
  await expect(stripAmount(card, "Income")).toBeVisible();
  const options = await switchOptions(page, card);
  for (const code of totals.keys()) {
    expect(options, `${code} has activity in ${start.toISOString().slice(0, 7)} but is not offered`).toContain(code);
  }

  for (const code of options) {
    await selectCurrency(page, card, code);
    const expected = totals.get(code) ?? { income: 0, expenses: 0 };
    for (const [label, value] of [
      ["Income", expected.income],
      ["Expenses", expected.expenses],
    ] as const) {
      const amount = stripAmount(card, label);
      await expect
        .poll(() => readMilli(amount), { message: `${label} in ${code} for ${start.toISOString().slice(0, 7)}` })
        .toBe(value);
      await expect(amount).toHaveAttribute("title", new RegExp(escapeRegExp(currencySymbol(code))));
    }
  }
  return totals;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("monthly summary currency (UX fixture)", () => {
  test("each currency's totals match its own transactions, this month and four months back", async ({ page, baseURL }) => {
    await showAllAccounts(page, baseURL);
    const requests = recordSummaryRequests(page);

    await page.goto("/dashboard");
    const card = summaryCard(page);
    await expect(card).toContainText("All accounts");
    await expect(stripAmount(card, "Income")).toBeVisible();

    await expectSummaryMatchesTransactions(page, card, 0);

    for (let i = 0; i < 4; i++) await card.getByRole("button", { name: "Previous month" }).click();
    // Four months back the archived "Old savings" (EUR) has its opening deposit.
    const totals = await expectSummaryMatchesTransactions(page, card, 4);
    expect(totals.get("EUR")?.income ?? 0, "fixture: archived EUR activity four months back").toBeGreaterThan(0);

    // Every all-accounts request the browser made named exactly one currency.
    const allAccounts = requests.filter((url) => !url.searchParams.get("accountId"));
    expect(allAccounts.length).toBeGreaterThan(0);
    for (const url of allAccounts) expect(url.searchParams.get("currency"), url.toString()).toMatch(/^[A-Z]{3}$/);
  });
});

test.describe("monthly summary currency (one active currency, archived EUR activity)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const EMAIL = "b06-summary-currency@mofin.test";
  const PASSWORD = "SummaryCurrency#2026";
  const TND_ACCOUNT = "B06 Dinar";
  const EUR_ACCOUNT = "B06 Old euros";

  type Account = { id: string; name: string; currency: string; archivedAt: string | null };

  async function api(page: Page, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown) {
    const res = await page.request.fetch(`/api/backend${path}`, { method, data });
    expect(res.ok(), `${method} ${path} failed with ${res.status()}: ${await res.text()}`).toBeTruthy();
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  }

  /**
   * Idempotent: signs in (registering on first run), makes sure both accounts exist, that
   * this month has TND and EUR income and spending, and that the EUR account is archived.
   */
  async function setUp(page: Page) {
    await page.request.post("/api/auth/register", { data: { email: EMAIL, password: PASSWORD, displayName: "B06" } });
    const login = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    expect(login.ok(), `login failed with ${login.status()}`).toBeTruthy();

    const listed = (await api(page, "GET", "/accounts?status=all&limit=100&offset=0")) as { data: Account[] };
    const find = (name: string) => listed.data.find((a) => a.name === name);
    const dinar: Account =
      find(TND_ACCOUNT) ??
      (await api(page, "POST", "/accounts", { name: TND_ACCOUNT, type: "BANK", currency: "TND", metadata: { decimals: 3 } }));
    const euros: Account =
      find(EUR_ACCOUNT) ?? (await api(page, "POST", "/accounts", { name: EUR_ACCOUNT, type: "SAVINGS", currency: "EUR" }));

    const { start, end } = monthBounds(0);
    const existing = new Set((await transactionsIn(page, start, end)).map((t) => t.description));
    // A minute ago, so it is never in the future and stays in the current month.
    const occurredAt = new Date(Date.now() - 60_000).toISOString();
    const missingEuro = ["B06 euro refund", "B06 euro taxi"].filter((d) => !existing.has(d));

    // Transactions can't be recorded on an archived account: restore it for the new month's.
    if (missingEuro.length && euros.archivedAt) await api(page, "PATCH", `/accounts/${euros.id}/restore`);
    const ensure = async (body: Record<string, unknown>) => {
      if (!existing.has(body.description as string)) await api(page, "POST", "/transactions", { ...body, occurredAt });
    };
    await ensure({ type: "INCOME", description: "B06 salary", amount: "2500.000", currency: "TND", toAccountId: dinar.id });
    await ensure({ type: "EXPENSE", description: "B06 groceries", amount: "120.500", currency: "TND", fromAccountId: dinar.id });
    await ensure({ type: "INCOME", description: "B06 euro refund", amount: "80.00", currency: "EUR", toAccountId: euros.id });
    // Spends the refund back down to zero, so archiving never trips over a balance rule.
    await ensure({ type: "EXPENSE", description: "B06 euro taxi", amount: "80.00", currency: "EUR", fromAccountId: euros.id });
    if (missingEuro.length || !euros.archivedAt) await api(page, "DELETE", `/accounts/${euros.id}`);

    const active = (await api(page, "GET", "/accounts?status=active&limit=100&offset=0")) as { data: Account[] };
    expect(active.data.map((a) => a.currency)).toEqual(["TND"]);
  }

  test("TND totals leave out the archived EUR account, and EUR can still be shown", async ({ page, baseURL }) => {
    await setUp(page);
    await showAllAccounts(page, baseURL);
    const requests = recordSummaryRequests(page);

    await page.goto("/dashboard");
    const card = summaryCard(page);
    await expect(card).toContainText("All accounts");
    await expect(stripAmount(card, "Income")).toBeVisible();

    // The only active account is TND, so that is what the card opens on.
    await expect(card.getByRole("combobox", { name: "Currency" })).toContainText("TND");
    await expect(stripAmount(card, "Income")).toHaveAttribute("title", /TND/);

    const totals = await expectSummaryMatchesTransactions(page, card, 0);
    expect(totals.get("EUR"), "EUR activity this month").toEqual({ income: 80_000, expenses: 80_000 });
    expect(totals.get("TND")?.income).toBeGreaterThanOrEqual(2_500_000);

    const allAccounts = requests.filter((url) => !url.searchParams.get("accountId"));
    for (const url of allAccounts) expect(url.searchParams.get("currency"), url.toString()).toMatch(/^[A-Z]{3}$/);
  });
});
