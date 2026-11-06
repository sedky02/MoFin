import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { AXE_TAGS, formatViolations } from "./helpers/axe";

// An opening balance counts in the balance but isn't a transaction, so monthly figures don't move.
// Archives its account at the end; needs `npm run e2e:seed`.
test.use({ locale: "en-US" });

const ACTIVE_ACCOUNT_COOKIE = "mofin-active-account";

type Account = { id: string; name: string; currency: string; openingBalance?: string };
type Summary = { income: string; expenses: string; savingsRate: string };

async function api<T>(page: Page, method: "GET" | "PATCH" | "DELETE", path: string, opts: { params?: Record<string, string | number>; data?: unknown } = {}) {
  const res = await page.request.fetch(`/api/backend${path}`, { method, ...opts });
  expect(res.ok(), `${method} ${path} failed with ${res.status()}`).toBeTruthy();
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function currentMonth() {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** This month's summary, recomputed (not served from the 15-minute cache). */
function summary(page: Page, params: Record<string, string>) {
  return api<Summary>(page, "GET", "/analytics/monthly-summary", {
    params: { ...currentMonth(), refresh: "true", ...params },
  });
}

function toMilli(formatted: string): number {
  const n = Number(formatted.replace(/[^0-9.-]/g, ""));
  expect(Number.isFinite(n), `could not read an amount from "${formatted}"`).toBeTruthy();
  return Math.round(n * 1000);
}

function accountCard(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function cardBalance(page: Page, name: string): Promise<number> {
  const amount = accountCard(page, name).locator("span.tabular[title]");
  await expect(amount).toBeVisible();
  return toMilli((await amount.getAttribute("title")) ?? "");
}

test.describe("opening balance", () => {
  let created: Account | undefined;

  test.afterEach(async ({ page }) => {
    if (!created) return;
    // Back to 0 first, so the archived account holds nothing and no all-accounts total changes.
    await api(page, "PATCH", `/accounts/${created.id}`, { data: { openingBalance: "0" } });
    await api(page, "DELETE", `/accounts/${created.id}`);
    created = undefined;
  });

  test("a new account starts from it without touching the month's income", async ({ page, baseURL }, testInfo) => {
    const name = `B10 Opening ${testInfo.project.name} ${Date.now()}`;
    const before = await summary(page, { currency: "USD" });

    await page.goto("/accounts");
    await page.getByRole("button", { name: "New account" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New account" });
    await expect(dialog).toBeVisible();

    const opening = dialog.getByLabel("Opening balance (optional)");
    await expect(opening).toBeVisible();
    await expect(dialog.getByText("What the account held before you started tracking it.")).toBeVisible();

    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(AXE_TAGS).analyze();
    expect(axe.violations, `axe violations in the account dialog\n${formatViolations(axe.violations)}`).toEqual([]);

    await dialog.getByLabel("Name").fill(name);
    // Currency defaults to USD.
    await opening.fill("5,000");
    await opening.blur();
    await expect(opening).toHaveValue("5000.00");
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog).toBeHidden();

    created = (await api<{ data: Account[] }>(page, "GET", "/accounts", { params: { status: "active", limit: 100, offset: 0 } }))
      .data.find((a) => a.name === name);
    expect(created, "the new account is listed").toBeTruthy();
    expect(created!.currency).toBe("USD");
    expect(Number(created!.openingBalance)).toBe(5000);

    // The card shows it as the balance.
    await expect.poll(() => cardBalance(page, name)).toBe(5_000_000);

    // Ledger balance and every point of the balance series include it.
    const balance = await api<{ key: string; balance: string }[]>(page, "GET", "/ledger/balance", { params: { accountId: created!.id } });
    expect(balance).toEqual([{ key: "USD", balance: "5000" }]);
    const series = await api<{ points: { balance: string; income: string }[] }>(page, "GET", "/analytics/monthly-series", {
      params: { months: 3, currency: "USD", accountId: created!.id },
    });
    expect(series.points.map((p) => Number(p.balance))).toEqual([5000, 5000, 5000]);
    expect(series.points.map((p) => Number(p.income))).toEqual([0, 0, 0]);

    // No transaction was created for it.
    const txs = await api<{ total: number }>(page, "GET", "/search/transactions", { params: { accountId: created!.id, limit: 1, offset: 0 } });
    expect(txs.total).toBe(0);

    // The month's income, expenses and % saved are what they were, all accounts and this one.
    const after = await summary(page, { currency: "USD" });
    expect(after).toEqual(expect.objectContaining({ income: before.income, expenses: before.expenses, savingsRate: before.savingsRate }));
    expect(Number((await summary(page, { accountId: created!.id })).income)).toBe(0);

    // And the dashboard's Monthly summary for the new account says so.
    await page.context().addCookies([{ name: ACTIVE_ACCOUNT_COOKIE, value: created!.id, url: baseURL! }]);
    await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [ACTIVE_ACCOUNT_COOKIE, created!.id]);
    await page.goto("/dashboard");
    const card = page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Monthly summary" }) });
    const income = card.locator("xpath=.//dt[normalize-space()='Income']/following-sibling::dd[1]//span[@title]");
    await expect(income).toBeVisible();
    expect(toMilli((await income.getAttribute("title")) ?? "")).toBe(0);
  });

  test("it can be edited afterwards, below zero too", async ({ page }, testInfo) => {
    const name = `B10 Edit ${testInfo.project.name} ${Date.now()}`;

    await page.goto("/accounts");
    await page.getByRole("button", { name: "New account" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New account" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog).toBeHidden();

    created = (await api<{ data: Account[] }>(page, "GET", "/accounts", { params: { status: "active", limit: 100, offset: 0 } }))
      .data.find((a) => a.name === name);
    expect(created, "the new account is listed").toBeTruthy();
    // Left blank, it starts at 0.
    expect(Number(created!.openingBalance)).toBe(0);
    await expect.poll(() => cardBalance(page, name)).toBe(0);

    await accountCard(page, name).getByRole("button", { name: `Edit ${name}` }).click();
    const edit = page.getByRole("dialog", { name: "Edit account" });
    const opening = edit.getByLabel("Opening balance (optional)");
    await expect(opening).toHaveValue("");
    await opening.fill("-250");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(edit).toBeHidden();

    await expect.poll(() => cardBalance(page, name)).toBe(-250_000);

    // Reopening shows the stored value.
    await accountCard(page, name).getByRole("button", { name: `Edit ${name}` }).click();
    await expect(page.getByRole("dialog", { name: "Edit account" }).getByLabel("Opening balance (optional)")).toHaveValue("-250.00");
    await page.keyboard.press("Escape");
  });
});
