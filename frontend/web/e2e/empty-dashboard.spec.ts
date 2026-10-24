import { expect, test, type APIRequestContext } from "@playwright/test";

// B-25: the empty dashboard names the right first step. Needs fresh users, not the fixture
// user, so each test registers a throwaway one. Register and login are rate limited: this
// spec creates two users and signs each in once.
test.use({ locale: "en-US", storageState: { cookies: [], origins: [] } });

const API = process.env.BACKEND_URL ?? "http://localhost:3000/api/v1";
const PASSWORD = "Empty#Dash1pass";

async function newUser(request: APIRequestContext, tag: string, project: string) {
  const email = `b25-${tag}-${Date.now().toString(36)}-${project}@mofin.test`;
  const registered = await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD } });
  expect(registered.ok(), `register failed with ${registered.status()}`).toBeTruthy();
  // Through the BFF with the page's own request context, so the session cookies reach the page.
  const login = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(login.ok(), `login failed with ${login.status()}`).toBeTruthy();
}

test("a new user with no accounts is offered one step: add an account", async ({ page }, testInfo) => {
  await newUser(page.request, "none", testInfo.project.name);
  await page.goto("/dashboard");

  const main = page.getByRole("main");
  const cta = main.getByRole("link", { name: "Add your first account" });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/accounts");
  await expect(main.getByRole("link")).toHaveCount(1);
  await expect(main.getByRole("button")).toHaveCount(0);
  await expect(main.getByText("Record an expense")).toHaveCount(0);
  await expect(main.getByText("Create your first account")).toHaveCount(0);
  expect(await main.innerText()).not.toContain("$");
});

test("an account without activity shows its own zero and the next step", async ({ page }, testInfo) => {
  await newUser(page.request, "tnd", testInfo.project.name);
  const created = await page.request.post("/api/backend/accounts", {
    data: { name: "Dinar", type: "BANK", currency: "TND", metadata: { decimals: 3 } },
  });
  expect(created.ok(), `account create failed with ${created.status()}`).toBeTruthy();

  await page.goto("/dashboard");
  const main = page.getByRole("main");
  await expect(main.getByText(/0\.000\s*TND|TND\s*0\.000/).first()).toBeVisible();
  await expect(main.getByRole("link", { name: "Record your first transaction" })).toBeVisible();
  await expect(main.getByText("Create your first account")).toHaveCount(0);
  await expect(main.getByText("Add your first account")).toHaveCount(0);
});
