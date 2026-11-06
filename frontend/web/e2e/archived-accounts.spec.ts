import { expect, test, type Page } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// Archived accounts show their real balance and the all-accounts hero adds up to its cards. Needs
// `npm run e2e:seed` ("Old savings" archived EUR, "Travel wallet" active EUR).
test.use({ locale: "en-US" });

type FixtureAccount = { id: string; name: string; currency: string };

async function listAccounts(page: Page, status: "active" | "archived"): Promise<FixtureAccount[]> {
  const res = await page.request.get("/api/backend/accounts", { params: { status, limit: 100, offset: 0 } });
  expect(res.ok(), `listing ${status} accounts failed with ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { data: FixtureAccount[] }).data;
}

/** "€1,072.60" / "-$27.40" → thousandths, so sums stay exact. */
function toMilli(formatted: string): number {
  const n = Number(formatted.replace(/[^0-9.-]/g, ""));
  expect(Number.isFinite(n), `could not read an amount from "${formatted}"`).toBeTruthy();
  return Math.round(n * 1000);
}

function accountCard(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function cardBalance(page: Page, name: string): Promise<string> {
  const card = accountCard(page, name);
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Couldn't load balance")).toHaveCount(0);
  const amount = card.locator("span.tabular[title]");
  await expect(amount).toBeVisible();
  return (await amount.getAttribute("title")) ?? "";
}

async function openView(page: Page, view: "Active" | "Archived") {
  const button =
    view === "Archived"
      ? page.getByRole("button", { name: /^Archived/ })
      : page.getByRole("button", { name: "Back to accounts" });
  if (await button.isVisible()) await button.click();
}

async function sumCards(page: Page, tab: "Active" | "Archived", accounts: FixtureAccount[], currency: string) {
  await openView(page, tab);
  let total = 0;
  for (const account of accounts.filter((a) => a.currency === currency)) {
    total += toMilli(await cardBalance(page, account.name));
  }
  return total;
}

test.describe("archived accounts", () => {
  test("the Archived tab shows Old savings with its real balance", async ({ page }) => {
    const old = (await listAccounts(page, "archived")).find((a) => a.name === "Old savings");
    expect(old, "archived fixture account not found: run `npm run e2e:seed`").toBeTruthy();

    // The API answers for an archived account instead of 404ing.
    const res = await page.request.get("/api/backend/ledger/balance", { params: { accountId: old!.id } });
    expect(res.status()).toBe(200);
    const [row] = (await res.json()) as { key: string; balance: string }[];
    expect(row.key).toBe("EUR");
    expect(Number(row.balance)).not.toBe(0);

    await page.goto("/accounts");
    await openView(page, "Archived");
    const shown = await cardBalance(page, "Old savings");
    expect(toMilli(shown)).toBe(Math.round(Number(row.balance) * 1000));
    await expect(page.getByRole("heading", { name: "Archived", exact: true })).toBeVisible();

    const all = await runAxe(page);
    await test.info().attach("axe archived tab", { body: formatViolations(all) || "no violations", contentType: "text/plain" });
    // The account cards' h3 under no h2 is already on the page; the headings pass is B-35's.
    const violations = all.filter((v) => v.id !== "heading-order");
    expect(violations, `axe violations on the Archived tab\n${formatViolations(violations)}`).toEqual([]);
  });

  test("the all-accounts hero equals the cards it covers and names archived accounts", async ({ page, context, baseURL }) => {
    const [active, archived] = await Promise.all([listAccounts(page, "active"), listAccounts(page, "archived")]);

    // Expected totals straight from what the account cards show.
    await page.goto("/accounts");
    const expected: Record<string, { total: number; archivedHolding: number }> = {};
    for (const currency of ["EUR", "USD"]) {
      const activeSum = await sumCards(page, "Active", active, currency);
      let archivedSum = 0;
      let archivedHolding = 0;
      await openView(page, "Archived");
      for (const account of archived.filter((a) => a.currency === currency)) {
        const milli = toMilli(await cardBalance(page, account.name));
        archivedSum += milli;
        if (milli !== 0) archivedHolding += 1;
      }
      expected[currency] = { total: activeSum + archivedSum, archivedHolding };
    }
    expect(expected.EUR.archivedHolding, "fixture should have an archived EUR account holding money").toBeGreaterThan(0);

    // Dashboard scoped to "All accounts" (cookie for the server prefetch, localStorage for the client).
    await context.addCookies([{ name: "mofin-active-account", value: "all", url: baseURL! }]);
    await page.addInitScript(() => localStorage.setItem("mofin-active-account", "all"));
    await page.goto("/dashboard");
    // A click on the server-rendered switcher before hydration does nothing.
    await page.waitForLoadState("networkidle");

    const switcher = page.getByRole("radiogroup", { name: "Currency" });
    const hero = page.locator("div.rounded-hero").filter({ has: switcher });
    await expect(hero).toBeVisible();

    for (const currency of ["EUR", "USD"]) {
      await switcher.getByRole("radio", { name: currency }).click();
      const caption = hero.getByText(`Across all ${currency} accounts`);
      await expect(caption).toBeVisible();

      const { total, archivedHolding } = expected[currency];
      if (archivedHolding > 0) {
        const plural = archivedHolding === 1 ? "" : "s";
        await expect(caption).toContainText(`incl. ${archivedHolding} archived account${plural}`);
      } else {
        await expect(caption).not.toContainText("archived");
      }

      // span.tabular: a MoneyAmount, not the switch's "Overdrawn" dot (which also has a title).
      const headline = hero.locator("span.tabular[title]").first();
      await expect.poll(async () => toMilli((await headline.getAttribute("title")) ?? "")).toBe(total);
    }
  });
});
