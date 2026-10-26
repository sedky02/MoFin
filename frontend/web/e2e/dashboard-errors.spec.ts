import { expect, test } from "@playwright/test";

// B-105: the dashboard's server prefetch runs on the Next server, so browser
// route interception can't fake a backend failure. The server / timeout /
// unreachable states are covered in unit tests (lib/server-api.test.ts and
// components/dashboard/dashboard-unavailable.test.tsx); this spec drives the
// one real condition reachable without test-only backend endpoints.
test.use({ locale: "en-US", storageState: { cookies: [], origins: [] } });

test("an invalid session with no refresh cookie ends on the sign-in page", async ({ page, context, baseURL }) => {
  await context.addCookies([
    { name: "access_token", value: "not-a-real-token", url: baseURL ?? "http://localhost:3001" },
  ]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /sign in|log in/i }).first()).toBeVisible();
});
