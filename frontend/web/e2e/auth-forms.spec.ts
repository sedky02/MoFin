import { expect, test, type Page } from "@playwright/test";

// Register and login validate calmly and carry the email across. Registration is rate limited, so
// the spec registers once per project with a fresh address.
test.use({ locale: "en-US", storageState: { cookies: [], origins: [] } });

function alerts(page: Page, text: string) {
  return page.getByRole("alert").filter({ hasText: text });
}

test.describe("register form", () => {
  test("typing in the email field announces nothing until blur", async ({ page }) => {
    await page.goto("/register");
    const email = page.getByRole("textbox", { name: "Email" });
    await email.click();
    await email.pressSequentially("not-an-em", { delay: 20 });
    await expect(alerts(page, "Enter a valid email address.")).toHaveCount(0);

    await page.getByRole("textbox", { name: /Display name/ }).click();
    await expect(alerts(page, "Enter a valid email address.")).toHaveCount(1);
  });

  test("an empty submit shows the password message once", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(alerts(page, "Use at least 8 characters.")).toHaveCount(1);
    await expect(page.getByText("Use at least 8 characters.")).toHaveCount(1);
  });

  test("a short password with varied characters isn't rated Good", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Password", { exact: true }).fill("Ab1!");
    await expect(page.getByText("Too short", { exact: true })).toBeVisible();
    await expect(page.getByText("Good", { exact: true })).toHaveCount(0);
  });

  test("registering opens /login with the email filled in and no password in the URL", async ({
    page,
  }, testInfo) => {
    const email = `b46-${Date.now().toString(36)}-${testInfo.project.name}@mofin.test`;
    const password = "Chosen#Pass1";
    await page.goto("/register");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/login\?/);
    expect(page.url()).not.toContain(password);
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(email);
    await expect(page.getByText("Sign in with the password you just chose.")).toBeVisible();
  });
});

test.describe("login form", () => {
  test("the password field has no bullet placeholder", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toBeVisible();
    await expect(password).not.toHaveAttribute("placeholder", /.+/);
  });
});
