import { expect, test } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// B-23c: Settings → Delete account removes the account and its data, then
// lands on /login with a notice. The profile copy no longer suggests the
// email can be changed somewhere else.
//
// Deletes a throwaway user per project, never the shared fixture user.
// Credential routes are rate limited per email + IP, so this registers once
// and signs in once, plus one refused login after the deletion.

test.describe("settings delete account", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("delete a throwaway account from the danger zone", async ({ page }, testInfo) => {
    const email = `b23c-${Date.now().toString(36)}-${testInfo.project.name}@mofin.test`;
    const password = "Throwaway#Pass1";

    const registered = await page.request.post("/api/auth/register", { data: { email, password } });
    expect(registered.ok(), `register failed with ${registered.status()}`).toBeTruthy();
    const login = await page.request.post("/api/auth/login", { data: { email, password } });
    expect(login.ok(), `login failed with ${login.status()}`).toBeTruthy();

    await page.goto("/settings");

    // The email copy states a fact instead of pointing at another place.
    await expect(page.getByText("Your sign-in email. Changing it isn't supported yet.")).toBeVisible();
    await expect(page.getByText(/can't be changed here/)).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Delete account", level: 2 })).toBeVisible();
    await expect(page.getByText("Export your data first if you want to keep a copy.")).toBeVisible();

    await page.getByRole("button", { name: "Delete account…" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
    await expect(dialog).toBeVisible();

    const violations = await runAxe(page);
    await testInfo.attach("axe delete dialog", { body: formatViolations(violations) || "no violations", contentType: "text/plain" });
    expect(violations, `axe violations on the delete dialog\n${formatViolations(violations)}`).toEqual([]);

    const form = dialog.getByRole("form", { name: "Delete account" });
    const confirm = form.getByLabel("Type DELETE to confirm");
    const passwordField = form.getByLabel("Password", { exact: true });
    const submit = form.getByRole("button", { name: "Delete account" });

    // Nothing typed: both fields say what they need.
    await submit.click();
    await expect(form.getByText("Type DELETE to confirm.")).toBeVisible();
    await expect(form.getByText("Enter your password.")).toBeVisible();

    // A wrong password is refused on the field, and nothing is deleted.
    await confirm.fill("DELETE");
    await passwordField.fill("not-my-password");
    await submit.click();
    await expect(form.getByText("The password is incorrect.")).toBeVisible();
    await expect(passwordField).toBeFocused();
    await expect(page).toHaveURL(/\/settings$/);

    await passwordField.fill(password);
    await submit.click();

    await expect(page).toHaveURL(/\/login\?reason=account_deleted$/);
    await expect(page.getByText("Your account and its data were deleted.")).toBeVisible();

    // The session and the account are gone.
    expect((await page.request.post("/api/auth/refresh")).status()).toBe(401);
    expect((await page.request.post("/api/auth/login", { data: { email, password } })).status()).toBe(401);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });
});
