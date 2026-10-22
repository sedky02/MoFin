import { expect, test, type Locator, type Page } from "@playwright/test";

// B-24: the dashboard hero's headline, caption and chip follow the chosen metric, and the
// headline uses exactly the figures of the Monthly summary for the same month and currency.
// Runs on the UX fixture (`npm run e2e:seed`).

test.use({ locale: "en-US" });

const ACTIVE_ACCOUNT_COOKIE = "mofin-active-account";

/** Amount in thousandths, so 3-decimal currencies compare exactly. */
const toMilli = (amount: string) => Math.round(Number(amount.replace(/[^0-9.-]/g, "")) * 1000);

function summaryCard(page: Page) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Monthly summary" }) });
}

/** The hero card: the one that holds the chart-metric tabs. */
function hero(page: Page) {
  return page.getByRole("tablist", { name: "Chart metric" }).locator("xpath=ancestor::div[contains(@class,'rounded-hero')][1]");
}

/** The hero's headline amount (its MoneyAmount title is the full value). */
function headline(page: Page) {
  return hero(page).locator("span[title].text-5xl");
}

function stripAmount(card: Locator, label: "Income" | "Expenses") {
  return card.locator(`xpath=.//dt[normalize-space()='${label}']/following-sibling::dd[1]//span[@title]`);
}

async function title(locator: Locator): Promise<string | null> {
  return locator.getAttribute("title", { timeout: 1000 }).catch(() => null);
}

/**
 * The hero and the summary each have their own currency switch. Put both on USD, where the
 * fixture has activity this month (EUR has none, so its chip is hidden and every figure is 0).
 */
async function showUsd(page: Page) {
  // A click that lands before hydration is lost, so retry until the radio takes it.
  const usd = hero(page).getByRole("radio", { name: "USD", exact: true });
  await expect(async () => {
    await usd.click();
    await expect(usd).toBeChecked({ timeout: 1000 });
  }).toPass();
  await summaryCard(page).getByRole("combobox", { name: "Currency" }).click();
  await page.getByRole("option", { name: /USD/ }).click();
  await expect(summaryCard(page).getByRole("combobox", { name: "Currency" })).toContainText("USD");
}

async function showAllAccounts(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([{ name: ACTIVE_ACCOUNT_COOKIE, value: "all", url: baseURL ?? "http://localhost:3001" }]);
  await page.addInitScript((key) => localStorage.setItem(key, "all"), ACTIVE_ACCOUNT_COOKIE);
}

test.describe("hero metric (UX fixture)", () => {
  test("Expenses and Income headlines equal the Monthly summary's current month", async ({ page, baseURL }) => {
    await showAllAccounts(page, baseURL);
    await page.goto("/dashboard");

    const card = summaryCard(page);
    await expect(card).toContainText("All accounts");
    await expect(stripAmount(card, "Income")).toBeVisible();
    await expect(headline(page)).toBeVisible();
    await showUsd(page);

    // The summary opens on the current month (no stepping back), which is the series' last point.
    for (const [tab, label, caption] of [
      ["Expenses", "Expenses", /^Spent in /],
      ["Income", "Income", /^Earned in /],
    ] as const) {
      await hero(page).getByRole("tab", { name: tab }).click();
      await expect(hero(page).getByText(caption)).toBeVisible();
      const summary = stripAmount(card, label);
      await expect
        .poll(async () => {
          const [h, s] = [await title(headline(page)), await title(summary)];
          return h && s ? toMilli(h) - toMilli(s) : null;
        }, { message: `${tab} headline vs summary ${label}` })
        .toBe(0);
      // Same currency symbol on both.
      const [h, s] = [await title(headline(page)), await title(summary)];
      expect((h ?? "").replace(/[0-9.,\s-]/g, "")).toBe((s ?? "").replace(/[0-9.,\s-]/g, ""));
    }
  });

  test("the Balance chip is labelled, and Net says how it is defined", async ({ page, baseURL }) => {
    await showAllAccounts(page, baseURL);
    await page.goto("/dashboard");

    const card = summaryCard(page);
    await expect(stripAmount(card, "Income")).toBeVisible();
    await expect(card).toContainText("income − expenses, excl. transfers");
    await showUsd(page);

    await hero(page).getByRole("tab", { name: "Balance" }).click();
    await expect(hero(page)).toContainText("Balance change");
    await expect(hero(page)).toContainText("this month");

    await hero(page).getByRole("tab", { name: "Expenses" }).click();
    await expect(hero(page)).not.toContainText("Balance change");
  });
});
