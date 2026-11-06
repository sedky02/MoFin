import { expect, test, type APIRequestContext } from "@playwright/test";

// Below lg (1024px) the monthly summary comes before Goals; from lg up Goals sits beside the
// balance. Registers a throwaway user, since it needs recorded data.
test.use({ locale: "en-US", storageState: { cookies: [], origins: [] } });

const API = process.env.BACKEND_URL ?? "http://localhost:3000/api/v1";
const PASSWORD = "Order#Dash1pass";

async function userWithData(request: APIRequestContext, project: string) {
  const email = `order-${Date.now().toString(36)}-${project}@mofin.test`;
  const registered = await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD } });
  expect(registered.ok(), `register failed with ${registered.status()}`).toBeTruthy();
  const login = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(login.ok(), `login failed with ${login.status()}`).toBeTruthy();
  const account = await request.post("/api/backend/accounts", { data: { name: "Dinar", type: "BANK", currency: "TND" } });
  const { id } = await account.json();
  const tx = await request.post("/api/backend/transactions", {
    data: { type: "EXPENSE", description: "Coffee", amount: "3", currency: "TND", occurredAt: new Date().toISOString().slice(0, 10), fromAccountId: id },
  });
  expect(tx.ok()).toBeTruthy();
}

test("below lg the monthly summary comes before Goals; from lg Goals sits beside the balance", async ({ page }, testInfo) => {
  await userWithData(page.request, testInfo.project.name);
  await page.goto("/dashboard");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Recent transactions", exact: true })).toBeVisible();

  const box = async (name: string) => {
    const card = main.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name, exact: true }) }).first();
    const b = await card.boundingBox();
    expect(b, `${name} card has a box`).not.toBeNull();
    return b!;
  };
  const hero = async () => (await main.locator(".shadow-hero").first().boundingBox())!;

  for (const [label, width] of [["phone", 390], ["tablet", 820]] as const) {
    await page.setViewportSize({ width, height: 1000 });
    const [h, summary, goals, recent] = [await hero(), await box("Monthly summary"), await box("Goals"), await box("Recent transactions")];
    expect(summary.y, `${label}: summary below the balance`).toBeGreaterThan(h.y + h.height - 1);
    expect(goals.y, `${label}: Goals below the summary`).toBeGreaterThan(summary.y + summary.height - 1);
    expect(recent.y, `${label}: Recent below Goals`).toBeGreaterThan(goals.y + goals.height - 1);
    for (const b of [summary, goals, recent]) expect(Math.abs(b.x - h.x), `${label}: aligned`).toBeLessThan(2);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  const [h, summary, goals, recent] = [await hero(), await box("Monthly summary"), await box("Goals"), await box("Recent transactions")];
  expect(Math.abs(goals.y - h.y), "Goals on the balance's row").toBeLessThan(2);
  expect(goals.x, "Goals to the right of the balance").toBeGreaterThan(h.x + h.width - 1);
  expect(summary.y, "summary on the next row").toBeGreaterThan(h.y + h.height - 1);
  expect(Math.abs(recent.y - summary.y), "Recent on the summary's row").toBeLessThan(2);
  expect(recent.x, "Recent to the right of the summary").toBeGreaterThan(summary.x + summary.width - 1);
});
