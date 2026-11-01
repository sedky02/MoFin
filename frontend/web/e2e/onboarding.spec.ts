import { expect, test, type APIRequestContext } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// First run: a new user is walked through the first account (with the currency of where the
// device is already chosen) and the first transaction, in one frame, before the dashboard.
// Each test registers a throwaway user (register and login are rate limited, so one each).
test.use({ locale: "en-US", timezoneId: "Africa/Tunis", storageState: { cookies: [], origins: [] } });

const API = process.env.BACKEND_URL ?? "http://localhost:3000/api/v1";
const PASSWORD = "Onboard#Pass1";

async function newUser(request: APIRequestContext, tag: string, project: string) {
  const email = `onb-${tag}-${Date.now().toString(36)}-${project}@mofin.test`;
  const registered = await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD, displayName: "Sami Test" } });
  expect(registered.ok(), `register failed with ${registered.status()}`).toBeTruthy();
  const login = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(login.ok(), `login failed with ${login.status()}`).toBeTruthy();
}

test("set up the first account and the first transaction in one flow, then land on the dashboard", async ({ page }, testInfo) => {
  await newUser(page.request, "flow", testInfo.project.name);
  await page.goto("/dashboard");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Add your first account" })).toBeVisible();
  await expect(main.getByText("Step 1 of 2")).toBeVisible();
  await expect(main.getByText(/^Welcome to MoFin, Sami\./)).toBeVisible();

  const violations = await runAxe(page, { include: "main" });
  await testInfo.attach("axe step 1", { body: formatViolations(violations) || "no violations", contentType: "text/plain" });
  expect(violations, `axe violations on step 1\n${formatViolations(violations)}`).toEqual([]);

  const form = main.getByRole("form", { name: "Add your first account" });
  // A time zone in Tunis means dinars, though the browser is set to en-US.
  await expect(form.getByRole("combobox", { name: /currency/i })).toContainText("TND");
  await expect(form.getByText(/Picked from where your device is\./)).toBeVisible();

  // The name follows the type until it is edited.
  await expect(form.getByLabel("Name")).toHaveValue("Main bank account");
  await form.getByRole("button", { name: "Cash" }).click();
  await expect(form.getByLabel("Name")).toHaveValue("Cash wallet");

  await form.getByLabel(/Balance today/).fill("120.5");
  await form.getByRole("button", { name: "Create account" }).click();

  // Step 2 is the same frame with new content, on the same page.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(main.getByRole("heading", { level: 1, name: "Record your first transaction" })).toBeVisible();
  await expect(main.getByText("Step 2 of 2")).toBeVisible();
  await expect(main.getByText("Cash wallet (TND) is ready.")).toBeVisible();
  await expect(main.getByRole("link", { name: /Add a transaction/ })).toHaveAttribute("href", "/transactions/new");
  await expect(main.getByRole("link", { name: /Describe it in words/ })).toHaveAttribute("href", "/drafts");

  const step2 = await runAxe(page, { include: "main" });
  expect(step2, `axe violations on step 2\n${formatViolations(step2)}`).toEqual([]);

  // Skipping goes to the dashboard, and stays skipped.
  await main.getByRole("button", { name: "Skip for now" }).click();
  await expect(main.getByText(/120\.500\s*TND|TND\s*120\.500/).first()).toBeVisible();
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(0);
  await page.reload();
  await expect(main.getByText(/120\.500\s*TND|TND\s*120\.500/).first()).toBeVisible();
  await expect(main.getByText("Step 2 of 2")).toHaveCount(0);

  // After setup, one quiet line suggests an assistant, and closing it sticks.
  const nudge = main.getByRole("region", { name: "Connect an assistant" });
  await expect(nudge.getByRole("link", { name: "Connect" })).toHaveAttribute("href", "/connect");
  await nudge.getByRole("button", { name: "Dismiss this suggestion" }).click();
  await expect(nudge).toHaveCount(0);
  await page.reload();
  await expect(main.getByText(/120\.500\s*TND|TND\s*120\.500/).first()).toBeVisible();
  await expect(main.getByRole("region", { name: "Connect an assistant" })).toHaveCount(0);
});

test("the second step ends by itself once a transaction exists, however it was recorded", async ({ page }, testInfo) => {
  await newUser(page.request, "tick", testInfo.project.name);
  const account = await page.request.post("/api/backend/accounts", { data: { name: "Dinar", type: "BANK", currency: "TND" } });
  expect(account.ok()).toBeTruthy();
  const { id } = await account.json();
  await page.goto("/dashboard");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Record your first transaction" })).toBeVisible();

  const tx = await page.request.post("/api/backend/transactions", {
    data: { type: "EXPENSE", description: "Coffee", amount: "3", currency: "TND", occurredAt: new Date().toISOString().slice(0, 10), fromAccountId: id },
  });
  expect(tx.ok()).toBeTruthy();
  await page.reload();
  await expect(main.getByText("Coffee")).toBeVisible();
  await expect(main.getByText("Step 2 of 2")).toHaveCount(0);
});
