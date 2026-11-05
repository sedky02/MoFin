import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// One entry per page.tsx under app/. Keep in sync when adding routes.
const APP_ROUTES = [
  "/dashboard",
  "/accounts",
  "/categories",
  "/goals",
  "/ask",
  "/drafts",
  "/transactions",
  "/connect",
  "/settings",
  "/transactions/new",
];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

function sampleTransactionId(): string | undefined {
  const file = "e2e/.auth/fixture.json";
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")).sampleTransactionId;
}

async function visitAndScan(page: import("@playwright/test").Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBeLessThan(400);

  const violations = await runAxe(page);
  const report = formatViolations(violations);
  await test.info().attach(`axe ${path}`, { body: report || "no violations", contentType: "text/plain" });
  if (violations.length) {
    test.info().annotations.push({ type: "axe", description: `${path}: ${violations.length} violation(s)\n${report}` });
  }
  // Soft: axe findings are reported, they do not stop the remaining routes.
  expect.soft(violations, `axe violations on ${path}\n${report}`).toEqual([]);
  expect.soft(errors, `uncaught page errors on ${path}`).toEqual([]);
}

test.describe("logged-in routes", () => {
  for (const route of APP_ROUTES) {
    test(`axe ${route}`, async ({ page }) => {
      await visitAndScan(page, route);
    });
  }

  test("axe /transactions/[id]", async ({ page }) => {
    const id = sampleTransactionId();
    test.skip(!id, "no sample transaction id: run `npm run e2e:seed`");
    await visitAndScan(page, `/transactions/${id}`);
  });
});

test.describe("auth routes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const route of AUTH_ROUTES) {
    test(`axe ${route}`, async ({ page }) => {
      await visitAndScan(page, route);
    });
  }
});
