import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { formatViolations, runAxe } from "./helpers/axe";

// A series that can't post is paused with the reason, and resuming is refused until it can. The
// nightly job isn't triggerable here, so tests pause via API/UI. Needs `npm run e2e:seed`.
test.use({ locale: "en-US", timezoneId: "Africa/Tunis" });

type Tx = {
  id: string;
  description: string;
  recurringStatus?: "ACTIVE" | "PAUSED" | "CANCELLED" | null;
  recurringError?: string | null;
  nextOccurrenceAt?: string | null;
};
type FixtureAccount = { id: string; name: string; currency: string };

async function mainChecking(request: APIRequestContext): Promise<FixtureAccount> {
  const res = await request.get("/api/backend/accounts", { params: { status: "all", limit: 100, offset: 0 } });
  expect(res.ok(), `listing accounts failed with ${res.status()}`).toBeTruthy();
  const main = ((await res.json()) as { data: FixtureAccount[] }).data.find((a) => a.name === "Main checking");
  expect(main, 'fixture account "Main checking" not found: run `npm run e2e:seed`').toBeTruthy();
  return main!;
}

async function createSeries(request: APIRequestContext, account: FixtureAccount, description: string): Promise<Tx> {
  const res = await request.post("/api/backend/transactions", {
    data: {
      type: "EXPENSE",
      description,
      amount: "1.00",
      currency: account.currency,
      occurredAt: new Date().toISOString(),
      fromAccountId: account.id,
      isRecurring: true,
      recurringInterval: "MONTHLY",
    },
  });
  expect(res.ok(), `creating the series failed with ${res.status()}: ${await res.text()}`).toBeTruthy();
  const series = (await res.json()) as Tx;
  expect(series.recurringStatus).toBe("ACTIVE");
  return series;
}

async function getTx(request: APIRequestContext, id: string): Promise<Tx> {
  const res = await request.get(`/api/backend/transactions/${id}`);
  expect(res.ok(), `GET transaction failed with ${res.status()}`).toBeTruthy();
  return (await res.json()) as Tx;
}

async function deleteSeries(request: APIRequestContext, id: string) {
  const res = await request.delete(`/api/backend/transactions/${id}`);
  expect(res.ok(), `deleting the test series failed with ${res.status()}`).toBeTruthy();
}

const shownDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "Africa/Tunis" }).format(
    new Date(iso),
  );

const startOfTodayUtc = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

const seriesAction = (page: Page, id: string, action: "pause" | "resume") =>
  page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith(`/transactions/${id}/recurring/${action}`),
  );

const seriesRow = (page: Page, id: string): Locator =>
  page
    .getByRole("list", { name: "Recurring series" })
    .getByRole("listitem")
    .filter({ has: page.locator(`a[href="/transactions/${id}"]`) });

test("pause and resume a series by hand", async ({ page }) => {
  const account = await mainChecking(page.request);
  const series = await createSeries(page.request, account, `Pause by hand ${Date.now()}`);

  try {
    // On the series' own page: Pause.
    await page.goto(`/transactions/${series.id}`);
    await expect(page.getByText(`Next on ${shownDate(series.nextOccurrenceAt!)}`)).toBeVisible();
    const paused = seriesAction(page, series.id, "pause");
    await page.getByRole("button", { name: "Pause series" }).click();
    expect((await paused).ok()).toBeTruthy();

    // Paused by hand: no reason, no next date, Resume in place of Pause.
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Next on /)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resume series" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause series" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit series" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel series" })).toBeVisible();
    const afterPause = await getTx(page.request, series.id);
    expect(afterPause.recurringStatus).toBe("PAUSED");
    expect(afterPause.recurringError ?? null).toBeNull();

    // In the Recurring view: the row says Paused, and resumes in place.
    await page.goto("/transactions?view=recurring");
    const row = seriesRow(page, series.id);
    await expect(row).toContainText("Paused", { timeout: 15_000 });
    await expect(row).not.toContainText("Next on");
    await expect(row).not.toContainText("Cancelled");
    const resumed = seriesAction(page, series.id, "resume");
    await row.getByRole("button", { name: "Resume series" }).click();
    expect((await resumed).ok()).toBeTruthy();

    // Paused and resumed the same day: nothing fell due, the next date stands.
    await expect(row).toContainText(`Next on ${shownDate(series.nextOccurrenceAt!)}`);
    await expect(row).not.toContainText("Paused");
    await expect(row.getByRole("button", { name: "Pause series" })).toBeVisible();
    const afterResume = await getTx(page.request, series.id);
    expect(afterResume.recurringStatus).toBe("ACTIVE");
    expect(afterResume.nextOccurrenceAt).toBe(series.nextOccurrenceAt);
  } finally {
    await deleteSeries(page.request, series.id);
  }
});

test("a series that can't post shows why, and resumes once its account is back", async ({ page }) => {
  const account = await mainChecking(page.request);
  const series = await createSeries(page.request, account, `Pause archived ${Date.now()}`);
  let archived = false;

  try {
    const pause = await page.request.post(`/api/backend/transactions/${series.id}/recurring/pause`);
    expect(pause.ok(), `pausing failed with ${pause.status()}`).toBeTruthy();
    // What the nightly job would trip over: the account it posts from is archived.
    const archive = await page.request.delete(`/api/backend/accounts/${account.id}`);
    expect(archive.ok(), `archiving the account failed with ${archive.status()}`).toBeTruthy();
    archived = true;

    await page.goto(`/transactions/${series.id}`);
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Next on /)).toHaveCount(0);

    // Resuming is refused while the account is archived, and the panel now says why.
    const reason = "Paused: Account Main checking is archived";
    const refused = seriesAction(page, series.id, "resume");
    await page.getByRole("button", { name: "Resume series" }).click();
    expect((await refused).status()).toBe(400);
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Account Main checking is archived" })).toBeVisible();
    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.getByText(/^Next on /)).toHaveCount(0);
    expect((await getTx(page.request, series.id)).recurringStatus).toBe("PAUSED");

    const violations = (await runAxe(page)).filter((v) => v.id !== "heading-order");
    expect(violations, `axe violations on a paused series\n${formatViolations(violations)}`).toEqual([]);

    // Restoring the account lets it resume, from a date on or after today.
    const restore = await page.request.patch(`/api/backend/accounts/${account.id}/restore`);
    expect(restore.ok(), `restoring the account failed with ${restore.status()}`).toBeTruthy();
    archived = false;
    const resumed = seriesAction(page, series.id, "resume");
    await page.getByRole("button", { name: "Resume series" }).click();
    expect((await resumed).ok()).toBeTruthy();

    const after = await getTx(page.request, series.id);
    expect(after.recurringStatus).toBe("ACTIVE");
    expect(after.recurringError ?? null).toBeNull();
    expect(new Date(after.nextOccurrenceAt!).getTime()).toBeGreaterThanOrEqual(startOfTodayUtc());
    await expect(page.getByText(`Next on ${shownDate(after.nextOccurrenceAt!)}`)).toBeVisible();
    await expect(page.getByText(reason)).toHaveCount(0);
  } finally {
    if (archived) await page.request.patch(`/api/backend/accounts/${account.id}/restore`);
    await deleteSeries(page.request, series.id);
  }
});

test("editing a series offers only accounts in its currency", async ({ page }) => {
  const account = await mainChecking(page.request);
  const res = await page.request.get("/api/backend/accounts", { params: { limit: 100, offset: 0 } });
  const active = ((await res.json()) as { data: FixtureAccount[] }).data;
  const other = active.filter((a) => a.currency !== account.currency);
  test.skip(other.length === 0, "the fixture has no active account in another currency");
  const series = await createSeries(page.request, account, `Pause edit accounts ${Date.now()}`);

  try {
    await page.goto(`/transactions/${series.id}`);
    await page.getByRole("button", { name: "Edit series" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit recurring transaction" });
    await dialog.getByRole("combobox", { name: "Account" }).click();
    const options = page.getByRole("option");
    await expect(options.filter({ hasText: account.name })).toHaveCount(1);
    for (const a of other) await expect(options.filter({ hasText: a.name })).toHaveCount(0);
    await page.keyboard.press("Escape");
  } finally {
    await deleteSeries(page.request, series.id);
  }
});
