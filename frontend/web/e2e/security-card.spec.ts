import { expect, test, type APIRequestContext } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// B-23a: Settings → Security changes the password (keeping this session and
// signing out the others) and signs out everywhere.
//
// Uses a throwaway user per project, never the shared fixture user, whose
// password other specs rely on. Credential routes are rate limited per
// email + IP, so this signs in twice per user: once for the "other device",
// once for the browser under test.

async function signIn(request: APIRequestContext, email: string, password: string) {
  const res = await request.post("/api/auth/login", { data: { email, password } });
  expect(res.ok(), `login failed with ${res.status()}`).toBeTruthy();
}

test.describe("settings security card", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("change the password and stay signed in, then sign out everywhere", async ({ page, browser }, testInfo) => {
    const email = `b23a-${Date.now().toString(36)}-${testInfo.project.name}@mofin.test`;
    const oldPassword = "Original#Pass1";
    const newPassword = "Brand-New#Pass2";

    const registered = await page.request.post("/api/auth/register", { data: { email, password: oldPassword } });
    expect(registered.ok(), `register failed with ${registered.status()}`).toBeTruthy();

    // Another device, signed in before the change.
    const otherDevice = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    await signIn(otherDevice.request, email, oldPassword);

    await signIn(page.request, email, oldPassword);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Security", level: 2 })).toBeVisible();
    const form = page.getByRole("form", { name: "Change password" });
    await expect(form).toBeVisible();

    const violations = await runAxe(page);
    await testInfo.attach("axe settings", { body: formatViolations(violations) || "no violations", contentType: "text/plain" });
    expect(violations, `axe violations on /settings\n${formatViolations(violations)}`).toEqual([]);

    // A wrong current password is shown on the field, and the session survives it.
    await form.getByLabel("Current password").fill("not-my-password");
    await form.getByLabel("New password", { exact: true }).fill(newPassword);
    await form.getByLabel("Repeat new password").fill(newPassword);
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByText("The current password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);

    await form.getByLabel("Current password").fill(oldPassword);
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed. Other devices were signed out.")).toBeVisible();

    // This browser is still signed in and can keep working, including a refresh.
    expect((await page.request.post("/api/auth/refresh")).status()).toBe(200);
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/transactions/);

    // The other device's session is over: its refresh token is refused.
    expect((await otherDevice.request.post("/api/auth/refresh")).status()).toBe(401);
    await otherDevice.close();

    // Sign out everywhere, this browser included.
    await page.goto("/settings");
    // A click on the server-rendered button before hydration does nothing.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Sign out everywhere?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Sign out everywhere" }).click();

    await expect(page).toHaveURL(/\/login\?reason=signed_out$/);
    await expect(page.getByText("You've been signed out on every device.")).toBeVisible();
    expect((await page.request.post("/api/auth/refresh")).status()).toBe(401);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });
});
