import { expect, test } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// Settings → Delete data removes everything the user recorded and keeps the account:
// still signed in, same profile, starter categories back, and the dashboard starts over
// from the "add an account" welcome.
//
// Uses a throwaway user per project, never the shared fixture user.

test.describe("settings delete data", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("delete all data and stay signed in", async ({ page }, testInfo) => {
    const email = `delete-data-${Date.now().toString(36)}-${testInfo.project.name}@mofin.test`;
    const password = "Throwaway#Pass1";

    const registered = await page.request.post("/api/auth/register", { data: { email, password } });
    expect(registered.ok(), `register failed with ${registered.status()}`).toBeTruthy();
    const login = await page.request.post("/api/auth/login", { data: { email, password } });
    expect(login.ok(), `login failed with ${login.status()}`).toBeTruthy();

    // Something to delete: an account with a balance, a transaction and a category of their own.
    const account = await page.request.post("/api/backend/accounts", {
      data: { name: "Cash", type: "CASH", currency: "EUR", openingBalance: "50" },
    });
    expect(account.ok()).toBeTruthy();
    const { id: accountId } = await account.json();
    expect(
      (await page.request.post("/api/backend/categories", { data: { name: "My own", type: "EXPENSE" } })).ok(),
    ).toBeTruthy();
    expect(
      (
        await page.request.post("/api/backend/transactions", {
          data: { type: "EXPENSE", description: "Coffee", amount: "3", currency: "EUR", occurredAt: "2026-10-20", fromAccountId: accountId },
        })
      ).ok(),
    ).toBeTruthy();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Delete data", level: 2 })).toBeVisible();

    await page.getByRole("button", { name: "Delete data…" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete all your data?" });
    await expect(dialog).toBeVisible();

    // Only the dialog: the page behind it is covered by its own specs.
    const violations = await runAxe(page, { include: '[role="alertdialog"]' });
    await testInfo.attach("axe delete data dialog", { body: formatViolations(violations) || "no violations", contentType: "text/plain" });
    expect(violations, `axe violations on the delete data dialog\n${formatViolations(violations)}`).toEqual([]);

    const form = dialog.getByRole("form", { name: "Delete data" });
    const confirm = form.getByLabel("Type DELETE to confirm");
    const submit = form.getByRole("button", { name: "Delete data" });

    // Without the word, nothing is deleted.
    await submit.click();
    await expect(form.getByText("Type DELETE to confirm.")).toBeVisible();
    const stillThere = await page.request.get("/api/backend/accounts?status=all&limit=100&offset=0");
    expect((await stillThere.json()).data).toHaveLength(1);

    await confirm.fill("DELETE");
    await submit.click();

    await expect(page.getByText("All your data was deleted.")).toBeVisible();
    await expect(dialog).toBeHidden();
    // Still on Settings, still signed in.
    await expect(page).toHaveURL(/\/settings$/);
    expect((await page.request.get("/api/backend/users/me")).ok()).toBeTruthy();

    const accounts = await (await page.request.get("/api/backend/accounts?status=all&limit=100&offset=0")).json();
    expect(accounts.data).toHaveLength(0);
    const categories = await (await page.request.get("/api/backend/categories?status=active&limit=100&offset=0")).json();
    expect(categories.data.map((c: { name: string }) => c.name)).not.toContain("My own");
    expect(categories.data.map((c: { name: string }) => c.name)).toContain("Groceries");

    // The dashboard starts over.
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Add your first account" })).toBeVisible();
  });
});
