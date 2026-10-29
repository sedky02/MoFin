import { expect, test, type APIRequestContext } from "@playwright/test";

// B-17: a date-only "To" covers its whole day. With From = To = today, search lists
// today's transactions from 00:00 to 23:59, not only the ones at midnight.
// Days are UTC until per-user timezones land (B-18), so "today" here is today's UTC
// date. The test records its own expenses on the fixture's "Main checking" (USD):
// three today, plus one either side of the day that must stay out, and deletes them
// all at the end. Needs the UX fixture: `npm run e2e:seed`.
test.use({ locale: "en-US" });

// The dev-only Next indicator and query devtools sit bottom-left, over the mobile bar.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, .tsqd-parent-container { display: none !important; }";
      document.head.append(style);
    });
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

async function mainAccountId(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/backend/accounts", { params: { limit: 100, offset: 0 } });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: { id: string; name: string }[] };
  const main = body.data.find((a) => a.name === "Main checking");
  expect(main, 'fixture account "Main checking" not found: run `npm run e2e:seed`').toBeTruthy();
  return main!.id;
}

async function recordExpense(request: APIRequestContext, accountId: string, description: string, occurredAt: Date) {
  const res = await request.post("/api/backend/transactions", {
    data: {
      type: "EXPENSE",
      description,
      amount: "1.00",
      currency: "USD",
      occurredAt: occurredAt.toISOString(),
      fromAccountId: accountId,
    },
  });
  expect(res.ok(), `create failed with ${res.status()}: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

test("From = To = today lists every transaction from today, and nothing either side", async ({ page }) => {
  const accountId = await mainAccountId(page.request);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = today.toISOString().slice(0, 10);
  const tag = `Day bound ${Date.now()}`;

  const inside = [
    { description: `${tag} midnight`, at: today },
    { description: `${tag} noon`, at: new Date(today.getTime() + 12 * 60 * 60 * 1000) },
    { description: `${tag} late`, at: new Date(today.getTime() + DAY_MS - 60 * 1000) },
  ];
  const outside = [
    { description: `${tag} yesterday`, at: new Date(today.getTime() - 60 * 1000) },
    { description: `${tag} tomorrow`, at: new Date(today.getTime() + DAY_MS) },
  ];

  const ids: string[] = [];
  try {
    for (const tx of [...inside, ...outside]) ids.push(await recordExpense(page.request, accountId, tx.description, tx.at));

    await page.goto("/search");
    await page.getByLabel("Search transactions").fill(tag);
    const filters = page.getByRole("button", { name: /^Filters/ });
    if ((await filters.getAttribute("aria-expanded")) === "false") await filters.click();
    await page.getByLabel("From date").fill(day);
    await page.getByLabel("To date").fill(day);
    await expect(page).toHaveURL(new RegExp(`from=${day}.*to=${day}`));

    for (const tx of inside) await expect(page.getByText(tx.description, { exact: true })).toBeVisible();
    for (const tx of outside) await expect(page.getByText(tx.description, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /results?/ })).toContainText("3 results");
  } finally {
    for (const id of ids) {
      const res = await page.request.delete(`/api/backend/transactions/${id}`);
      expect([204, 404]).toContain(res.status());
    }
  }
});
