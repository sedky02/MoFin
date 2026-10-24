import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// B-15: recurring series can be found and managed. An occurrence's "Generated from
// a recurring series" badge opens its series, and the Recurring view of
// /transactions (?view=recurring) lists every series once, by its root, with its
// next date, amount and account, and cancels one in place. Cancelling stops the
// series and keeps the transaction; a deleted root is left out.
// Needs the UX fixture (`npm run e2e:seed`): "Rent (monthly)" is a monthly
// 12.345 TND expense on Dinar. The cancel test creates and deletes its own series.
test.use({ locale: "en-US", timezoneId: "Africa/Tunis" });

const RENT = "Rent (monthly)";

type Tx = {
  id: string;
  description: string;
  isRecurring: boolean;
  parentTransactionId?: string | null;
  recurringStatus?: "ACTIVE" | "CANCELLED" | null;
  nextOccurrenceAt?: string | null;
  deletedAt?: string | null;
};

/** Every match of a search, all pages. */
async function searchAll(request: APIRequestContext, params: Record<string, string>): Promise<Tx[]> {
  const out: Tx[] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await request.get("/api/backend/search/transactions", {
      params: { limit: "100", offset: String(offset), ...params },
    });
    expect(res.ok(), `search failed with ${res.status()}: ${await res.text()}`).toBeTruthy();
    const body = (await res.json()) as { data: Tx[]; total: number };
    out.push(...body.data);
    if (body.data.length < 100 || out.length >= body.total) return out;
  }
}

async function getTx(request: APIRequestContext, id: string): Promise<Tx> {
  const res = await request.get(`/api/backend/transactions/${id}`);
  expect(res.ok(), `GET transaction failed with ${res.status()}`).toBeTruthy();
  return (await res.json()) as Tx;
}

/** The date as the page shows it (formatDate, en-US, in the browser's zone). */
const shownDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "Africa/Tunis" }).format(
    new Date(iso),
  );

const seriesList = (page: Page): Locator => page.getByRole("list", { name: "Recurring series" });

/** A series' row in the Recurring view, found by the link to its root. */
const seriesRow = (page: Page, id: string): Locator =>
  seriesList(page).getByRole("listitem").filter({ has: page.locator(`a[href="/transactions/${id}"]`) });

/** Waits for the Recurring view to finish loading: its footer, not "updating…". */
async function settled(page: Page) {
  const footer = page.getByRole("tabpanel", { name: "Recurring" }).locator("p[role=status]");
  await expect(footer).toBeVisible({ timeout: 15_000 });
  await expect(footer).not.toContainText("updating");
}

test("an occurrence's badge opens the series it was generated from", async ({ page }) => {
  // An occurrence of a live series (a deleted root's page is "not found").
  const liveRoots = new Set((await searchAll(page.request, { recurrence: "series" })).map((t) => t.id));
  const occurrences = (await searchAll(page.request, { recurrence: "recurring" })).filter(
    (t) => !!t.parentTransactionId && liveRoots.has(t.parentTransactionId),
  );
  // The API can't post an occurrence; only the daily recurring job does, so a fresh
  // database has none until it has run once after the seed.
  test.skip(occurrences.length === 0, "no generated occurrence yet: the recurring job hasn't run since the seed");
  const occurrence = occurrences[0];
  const rootId = occurrence.parentTransactionId!;
  const root = await getTx(page.request, rootId);

  await page.goto(`/transactions/${occurrence.id}`);
  const badge = page.getByRole("link", { name: "Generated from a recurring series" });
  await expect(badge).toHaveAttribute("href", `/transactions/${rootId}`);
  await badge.click();

  await expect(page).toHaveURL(new RegExp(`/transactions/${rootId}$`));
  await expect(page.getByRole("heading", { level: 1, name: root.description })).toBeVisible();
  // The root's page is the one with the series panel.
  await expect(page.getByText(/^(Monthly|Yearly)/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Generated from a recurring series" })).toHaveCount(0);
});

test("the Recurring view lists every series once, with its next date", async ({ page }) => {
  const series = await searchAll(page.request, { recurrence: "series", sort: "next-occurrence" });
  // The series filter is exactly the roots of the recurring filter, deleted ones excluded.
  const roots = (await searchAll(page.request, { recurrence: "recurring" })).filter(
    (t) => t.isRecurring && !t.parentTransactionId,
  );
  expect(series.map((t) => t.id).sort()).toEqual(roots.map((t) => t.id).sort());
  expect(series.every((t) => !t.deletedAt)).toBe(true);
  const rent = series.find((t) => t.description === RENT);
  expect(rent, `fixture series "${RENT}" not found: run \`npm run e2e:seed\``).toBeTruthy();
  // Active series come first.
  const firstCancelled = series.findIndex((t) => t.recurringStatus !== "ACTIVE");
  if (firstCancelled >= 0) expect(series.slice(firstCancelled).every((t) => t.recurringStatus !== "ACTIVE")).toBe(true);

  // Reached from the list's tab, and kept in the URL.
  await page.goto("/transactions");
  await page.getByRole("tab", { name: "Recurring" }).click();
  await expect(page).toHaveURL(/[?&]view=recurring(&|$)/);
  await expect(page.getByRole("tab", { name: "Recurring" })).toHaveAttribute("aria-selected", "true");
  await settled(page);

  // The first page, in the API's order, one row per series.
  const firstPage = series.slice(0, 25);
  const links = seriesList(page).getByRole("listitem").locator('a[href^="/transactions/"]:not([href="/transactions/new"])');
  await expect(links).toHaveCount(firstPage.length);
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(firstPage.map((t) => `/transactions/${t.id}`));

  for (const t of firstPage) {
    const row = seriesRow(page, t.id);
    await expect(row).toHaveCount(1);
    if (t.recurringStatus === "ACTIVE" && t.nextOccurrenceAt) {
      await expect(row).toContainText(`Next on ${shownDate(t.nextOccurrenceAt)}`);
      await expect(row.getByRole("button", { name: "Cancel series" })).toBeVisible();
    } else {
      await expect(row).toContainText("Cancelled");
      await expect(row).not.toContainText("Next on");
      await expect(row.getByRole("button", { name: "Cancel series" })).toHaveCount(0);
    }
  }

  // The rent: its amount and account, and no row for any of its occurrences.
  const rentRow = seriesRow(page, rent!.id);
  await expect(rentRow).toContainText("12.345");
  await expect(rentRow).toContainText("Dinar");
  await expect(rentRow).toContainText("Monthly");
  await expect(seriesList(page).getByRole("link", { name: RENT, exact: true })).toHaveCount(1);

  // Opening ?view=recurring directly lands on the same view.
  await page.goto("/transactions?view=recurring");
  await expect(page.getByRole("tab", { name: "Recurring" })).toHaveAttribute("aria-selected", "true");
  await settled(page);
  await expect(seriesRow(page, rent!.id)).toBeVisible();
});

test("cancelling from the Recurring view ends the series and keeps the transaction", async ({ page }) => {
  const accounts = await page.request.get("/api/backend/accounts", { params: { limit: 100, offset: 0 } });
  expect(accounts.ok()).toBeTruthy();
  const main = ((await accounts.json()) as { data: { id: string; name: string }[] }).data.find(
    (a) => a.name === "Main checking",
  );
  expect(main, 'fixture account "Main checking" not found: run `npm run e2e:seed`').toBeTruthy();

  const description = `Recurring view cancel ${Date.now()}`;
  const created = await page.request.post("/api/backend/transactions", {
    data: {
      type: "EXPENSE",
      description,
      amount: "1.00",
      currency: "USD",
      occurredAt: new Date().toISOString(),
      fromAccountId: main!.id,
      isRecurring: true,
      recurringInterval: "MONTHLY",
    },
  });
  expect(created.ok(), `creating the series failed with ${created.status()}: ${await created.text()}`).toBeTruthy();
  const series = (await created.json()) as Tx;
  expect(series.recurringStatus).toBe("ACTIVE");

  try {
    await page.goto("/transactions?view=recurring");
    await settled(page);
    const row = seriesRow(page, series.id);
    await expect(row).toContainText(`Next on ${shownDate(series.nextOccurrenceAt!)}`);
    await expect(row).toContainText("Main checking");

    await row.getByRole("button", { name: "Cancel series" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Cancel recurring transaction?" });
    await expect(dialog).toContainText(description);
    const cancelled = page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().endsWith(`/transactions/${series.id}/recurring/cancel`),
    );
    await dialog.getByRole("button", { name: "Cancel series" }).click();
    expect((await cancelled).ok()).toBeTruthy();
    await expect(dialog).toBeHidden();

    // The row updates in place: cancelled, no next date, no actions left.
    await expect(row).toContainText("Cancelled");
    await expect(row).not.toContainText("Next on");
    await expect(row.getByRole("button", { name: "Cancel series" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Edit series" })).toHaveCount(0);

    // Ended, not deleted: the transaction is still there.
    const after = await getTx(page.request, series.id);
    expect(after.recurringStatus).toBe("CANCELLED");
    expect(after.deletedAt ?? null).toBeNull();
    const listed = await searchAll(page.request, { recurrence: "series", q: description });
    expect(listed.map((t) => t.id)).toEqual([series.id]);
  } finally {
    // Takes the 1.00 back out of the fixture's balances.
    const removed = await page.request.delete(`/api/backend/transactions/${series.id}`);
    expect(removed.ok(), `deleting the test series failed with ${removed.status()}`).toBeTruthy();
  }

  // A deleted root is left out of the view.
  expect(await searchAll(page.request, { recurrence: "series", q: description })).toEqual([]);
  await page.goto("/transactions?view=recurring");
  await settled(page);
  await expect(seriesRow(page, series.id)).toHaveCount(0);
});
