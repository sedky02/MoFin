import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Needs the backend started with MAIL_CAPTURE_DIR (see backend/.env.example),
// so the reset email lands as a JSON file this spec can read. E2E_MAIL_DIR
// points at that directory; the default matches MAIL_CAPTURE_DIR=.mail-outbox
// in backend/.
const API = process.env.BACKEND_URL ?? "http://localhost:3000/api/v1";
const MAIL_DIR = resolve(process.env.E2E_MAIL_DIR ?? "../../backend/.mail-outbox");

type CapturedMail = { to: string; subject: string; text: string; sentAt: string };

async function waitForResetLink(to: string, sentAfter: number): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(MAIL_DIR)) {
      for (const file of readdirSync(MAIL_DIR).filter((f) => f.endsWith(".json"))) {
        const mail = JSON.parse(readFileSync(join(MAIL_DIR, file), "utf8")) as CapturedMail;
        if (mail.to !== to || Date.parse(mail.sentAt) < sentAfter) continue;
        const match = /https?:\/\/\S+\/reset-password#token=[A-Za-z0-9_-]+/.exec(mail.text);
        if (match) return match[0];
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `No reset email for ${to} in ${MAIL_DIR}. Start the backend with MAIL_CAPTURE_DIR=.mail-outbox (or set E2E_MAIL_DIR).`,
  );
}

test.describe("password recovery", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("forgot password from /login, reset via the emailed link, sign in with the new password", async ({
    page,
    request,
  }, testInfo) => {
    const email = `b02-${Date.now().toString(36)}-${testInfo.project.name}@mofin.test`;
    const oldPassword = "Original#Pass1";
    const newPassword = "Brand-New#Pass2";

    const registered = await request.post(`${API}/auth/register`, { data: { email, password: oldPassword } });
    expect(registered.ok(), `register failed with ${registered.status()}`).toBeTruthy();

    await page.goto("/login");
    const forgotLink = page.getByRole("link", { name: "Forgot password?" });
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();
    await expect(page).toHaveURL(/\/forgot-password$/);

    const requestedAt = Date.now() - 1000;
    // Role, not label: after a client-side navigation the previous page's form stays in the DOM, hidden.
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    // The link points at WEB_URL; keep only path + fragment so it opens on
    // whatever base URL this run uses.
    const link = new URL(await waitForResetLink(email, requestedAt));
    await page.goto(`${link.pathname}${link.hash}`);

    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Repeat new password").fill(newPassword);
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByText("Your password has been reset.")).toBeVisible();

    // (Old password and old sessions failing is covered by the backend e2e
    // suite; login is rate-limited per IP, so this spec signs in only once.)
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // The same link can't be used twice.
    await page.context().clearCookies();
    await page.goto(`${link.pathname}${link.hash}`);
    await page.getByLabel("New password", { exact: true }).fill("Third#Pass3xx");
    await page.getByLabel("Repeat new password").fill("Third#Pass3xx");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("This reset link is invalid, was already used, or has expired.")).toBeVisible();
  });

  test("a reset page without a token offers a new link", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("This reset link is incomplete.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
  });
});
