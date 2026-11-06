import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// /login says why it opened, and a session that expires mid-save keeps what the user typed. Needs
// `npm run e2e:seed` ("Main checking" is USD, "Groceries" an expense category).
test.use({ locale: "en-US", storageState: { cookies: [], origins: [] } });

type Credentials = { email: string; password: string };
type Fixture = { accounts: Record<string, string> };

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new Error(`${path} not found. Run \`npm run e2e:seed\` first.`);
  }
}

function banner(page: Page, text: string) {
  return page.getByRole("alert").filter({ hasText: text });
}

/** The New transaction form's account picker (not the shell's account switcher). */
function accountField(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save transaction" }) })
    .getByRole("combobox")
    .first();
}

test.describe("login page explains why it opened", () => {
  test("a Google sign-in that didn't finish", async ({ page }) => {
    await page.goto("/login?error=google_failed");
    await expect(banner(page, "Google sign-in didn't finish — try again or use email.")).toBeVisible();
  });

  test("Google sign-in not being available", async ({ page }) => {
    await page.goto("/login?error=google_unconfigured");
    await expect(banner(page, "Google sign-in isn't available right now")).toBeVisible();
  });

  test("an expired session", async ({ page }) => {
    await page.goto("/login?next=%2Fgoals&reason=expired");
    await expect(banner(page, "Your session expired. Sign in to continue.")).toBeVisible();
  });

  test("an unknown code gets a generic message, never the raw value", async ({ page }) => {
    await page.goto("/login?error=%3Cb%3Einjected%3C%2Fb%3E");
    await expect(banner(page, "Sign-in didn't finish. Please try again.")).toBeVisible();
    await expect(page.getByText("injected")).toHaveCount(0);
  });

  test("a plain visit shows no banner", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(banner(page, "didn't finish")).toHaveCount(0);
    await expect(banner(page, "session expired")).toHaveCount(0);
  });
});

test.describe("session expiry on New transaction", () => {
  test("the form comes back after signing in again", async ({ page, context }) => {
    const creds = readJson<Credentials>("e2e/.auth/credentials.json");
    const fixture = readJson<Fixture>("e2e/.auth/fixture.json");
    const mainId = fixture.accounts["Main checking"];
    expect(mainId, "fixture account Main checking not found: run `npm run e2e:seed`").toBeTruthy();

    // Pin the active account so the form's default account is stable.
    await page.addInitScript((id) => localStorage.setItem("mofin-active-account", id), mainId);

    // A session of our own: the shared storage state must stay valid for other
    // specs. Login is rate limited, so this spec signs in twice in total.
    const login = await page.request.post("/api/auth/login", { data: creds });
    expect(login.ok(), `login failed with ${login.status()}`).toBeTruthy();

    await page.goto("/transactions/new");
    await expect(page.getByRole("heading", { level: 1, name: "New transaction" })).toBeVisible();

    const amount = page.getByLabel("Amount in USD");
    await expect(amount).toBeVisible();
    await amount.click();
    await amount.pressSequentially("12.34", { delay: 30 });
    const description = page.getByPlaceholder(/^Description, e\.g\./);
    const descriptionText = `Expiry check ${Date.now()}`;
    await description.fill(descriptionText);
    const groceries = page.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name: /Groceries/ });
    await groceries.click();
    await expect(groceries).toHaveAttribute("aria-checked", "true");
    await expect(accountField(page)).toContainText("Main checking");

    const before = {
      amount: await amount.inputValue(),
      date: await page.getByLabel("Date", { exact: true }).inputValue(),
    };
    expect(before.amount).toBe("12.34");

    // End the session the way an expired refresh token does: no auth cookies left.
    await context.clearCookies({ name: "access_token" });
    await context.clearCookies({ name: "refresh_token" });

    await page.getByRole("button", { name: "Save transaction" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Ftransactions%2Fnew&reason=expired$/);
    await expect(banner(page, "Your session expired. Sign in to continue.")).toBeVisible();

    await page.getByRole("textbox", { name: "Email" }).fill(creds.email);
    await page.getByLabel("Password", { exact: true }).fill(creds.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/transactions\/new$/);

    await expect(page.getByRole("status").filter({ hasText: "Restored your unsaved transaction." })).toBeVisible();
    await expect(page.getByLabel("Amount in USD")).toHaveValue(before.amount);
    await expect(page.getByPlaceholder(/^Description, e\.g\./)).toHaveValue(descriptionText);
    await expect(
      page.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name: /Groceries/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(accountField(page)).toContainText("Main checking");
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue(before.date);

    // Restored once: the stash is gone, and a reload starts from a blank form.
    expect(await page.evaluate(() => sessionStorage.getItem("mofin-unsaved-transaction"))).toBeNull();
    await page.reload();
    await expect(page.getByLabel("Amount in USD")).toHaveValue("");
    await expect(page.getByRole("status").filter({ hasText: "Restored your unsaved transaction." })).toHaveCount(0);
    // Nothing was saved, so there is nothing to delete.
  });
});
