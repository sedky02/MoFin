import { expect, test, type Page } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// B-03: the detail page names every account (archived ones too), shows a
// transfer's from → to, and keeps ledger-leg badges neutral.
// Needs the UX fixture: `npm run e2e:seed`.

const UUID_FRAGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i;

type FixtureTx = { id: string; description: string; voidedAt?: string | null; reversesTransactionId?: string | null };

/** Finds a fixture transaction by exact description through the BFF, using the logged-in session. */
async function findTransactionId(page: Page, description: string): Promise<string> {
  const res = await page.request.get("/api/backend/search/transactions", {
    params: { q: description, limit: 20, offset: 0 },
  });
  expect(res.ok(), `search for "${description}" failed with ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { data: FixtureTx[] };
  const match = body.data.find(
    (t) => t.description === description && !t.voidedAt && !t.reversesTransactionId,
  );
  expect(match, `fixture transaction "${description}" not found: run \`npm run e2e:seed\``).toBeTruthy();
  return match!.id;
}

async function openDetail(page: Page, description: string) {
  const id = await findTransactionId(page, description);
  await page.goto(`/transactions/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: description })).toBeVisible();
  // Names resolved, no placeholder left.
  await expect(page.getByText("Loading account")).toHaveCount(0);
  return id;
}

async function expectNoIds(page: Page) {
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(UUID_FRAGMENT);
}

async function expectNeutralLegBadges(page: Page) {
  const badges = page.locator("table tbody td span.rounded-md");
  const count = await badges.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const cls = (await badges.nth(i).getAttribute("class")) ?? "";
    expect(cls).not.toMatch(/\b(?:bg|text)-(?:success|destructive)\b/);
    await expect(badges.nth(i)).toHaveText(/^(Out|In)$/);
  }
}

async function expectNoAxeViolations(page: Page, label: string) {
  const violations = await runAxe(page);
  const report = formatViolations(violations);
  await test.info().attach(`axe ${label}`, { body: report || "no violations", contentType: "text/plain" });
  expect(violations, `axe violations on ${label}\n${report}`).toEqual([]);
}

/** The "Account" / "From → To" line in the summary card. */
function accountLine(page: Page, label: "Account" | "From → To") {
  return page.locator("dl > div").filter({ has: page.locator("dt", { hasText: label }) }).locator("dd");
}

test.describe("transaction detail accounts", () => {
  test("expense names its account and shows no ids", async ({ page }) => {
    await openDetail(page, "Groceries run");
    await expect(accountLine(page, "Account")).toHaveText("Main checking");
    await expect(page.locator("table tbody")).toContainText("Main checking");
    await expectNoIds(page);
    await expectNeutralLegBadges(page);
    await expectNoAxeViolations(page, "expense detail");
  });

  test("income names its account and shows no ids", async ({ page }) => {
    await openDetail(page, "Monthly salary");
    await expect(accountLine(page, "Account")).toHaveText("Main checking");
    await expectNoIds(page);
    await expectNeutralLegBadges(page);
    await expectNoAxeViolations(page, "income detail");
  });

  test("transfer header reads from → to, legs are Out and In", async ({ page }) => {
    await openDetail(page, "Emergency fund transfer");
    await expect(accountLine(page, "From → To")).toHaveText("Main checking → Emergency fund");
    await expect(page.getByText("Main checking → Emergency fund", { exact: true })).toBeVisible();

    const rows = page.locator("table tbody tr");
    await expect(rows.filter({ hasText: "Main checking" })).toContainText("Out");
    await expect(rows.filter({ hasText: "Emergency fund" })).toContainText("In");

    await expectNoIds(page);
    await expectNeutralLegBadges(page);
    await expectNoAxeViolations(page, "transfer detail");
  });

  test("transaction on an archived account still names it", async ({ page }) => {
    await openDetail(page, "Old savings opening deposit");
    await expect(accountLine(page, "Account")).toHaveText("Old savings");
    await expect(page.locator("table tbody")).toContainText("Old savings");
    await expect(page.getByText("Deleted account")).toHaveCount(0);
    await expectNoIds(page);
    await expectNeutralLegBadges(page);
    await expectNoAxeViolations(page, "archived-account detail");
  });
});
