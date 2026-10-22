import { expect, test, type Locator, type Page } from "@playwright/test";

// B-16: editing a recurring series keeps the currency's decimals. The 12.345
// TND rent opens as 12.345, and a save that only touches the description
// doesn't send the amount, so future occurrences stay at 12.345. The field shows "TND"
// once, after the amount, never drawn over the digits.
// Needs the UX fixture: `npm run e2e:seed` ("Rent (monthly)" is a monthly
// 12.345 TND expense on "Dinar").
test.use({ locale: "en-US" });

const RENT = "Rent (monthly)";

type SeriesRoot = {
  id: string;
  description: string;
  isRecurring: boolean;
  parentTransactionId?: string | null;
  voidedAt?: string | null;
  recurringAmount?: string | null;
  recurringStatus?: string | null;
};

/** The fixture's rent series root, found by exact description through the BFF. */
async function findRentRoot(page: Page): Promise<SeriesRoot> {
  const res = await page.request.get("/api/backend/search/transactions", {
    params: { q: RENT, limit: 20, offset: 0 },
  });
  expect(res.ok(), `search for "${RENT}" failed with ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { data: SeriesRoot[] };
  const root = body.data.find(
    (t) => t.description === RENT && t.isRecurring && !t.parentTransactionId && !t.voidedAt,
  );
  expect(root, `fixture series "${RENT}" not found: run \`npm run e2e:seed\``).toBeTruthy();
  return root!;
}

async function getSeries(page: Page, id: string): Promise<SeriesRoot> {
  const res = await page.request.get(`/api/backend/transactions/${id}`);
  expect(res.ok(), `GET transaction failed with ${res.status()}`).toBeTruthy();
  return (await res.json()) as SeriesRoot;
}

async function openEditSeries(page: Page, id: string, heading: string) {
  await page.goto(`/transactions/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await page.getByRole("button", { name: "Edit series" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit recurring transaction" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * How far a money field's prefix symbol reaches into the typed amount, in px
 * (<= 0 means no overlap). No prefix at all counts as 0.
 */
async function prefixOverlap(amount: Locator): Promise<number> {
  return amount.evaluate((input) => {
    const prefix = input.parentElement?.querySelector<HTMLElement>("span[aria-hidden]");
    if (!prefix) return 0;
    const textLeft = input.getBoundingClientRect().left + parseFloat(getComputedStyle(input).paddingLeft);
    return prefix.getBoundingClientRect().right - textLeft;
  });
}

test.describe("edit recurring series precision", () => {
  test("TND rent keeps 3 decimals, and a description-only save leaves the amount alone", async ({ page }) => {
    const root = await findRentRoot(page);
    expect(root.recurringStatus).toBe("ACTIVE");
    expect(Number((await getSeries(page, root.id)).recurringAmount)).toBe(12.345);

    const renamed = `${RENT} edited ${Date.now()}`;
    try {
      const dialog = await openEditSeries(page, root.id, RENT);
      await expect(dialog.getByLabel("Amount")).toHaveValue("12.345");
      // The code is shown once, after the amount, and nothing is drawn over the digits.
      const amountField = dialog.getByLabel("Amount").locator("xpath=..");
      await expect(amountField.getByText("TND", { exact: true })).toHaveCount(1);
      expect(await prefixOverlap(dialog.getByLabel("Amount"))).toBeLessThanOrEqual(0);

      await dialog.getByLabel("Description").fill(renamed);
      const patch = page.waitForRequest(
        (req) => req.method() === "PATCH" && req.url().endsWith(`/transactions/${root.id}/recurring`),
      );
      const saved = page.waitForResponse(
        (res) => res.request().method() === "PATCH" && res.url().endsWith(`/transactions/${root.id}/recurring`),
      );
      await dialog.getByRole("button", { name: "Save changes" }).click();

      // Only the changed field goes out.
      expect((await patch).postDataJSON()).toEqual({ description: renamed });
      expect((await saved).ok()).toBeTruthy();
      await expect(dialog).toBeHidden();

      const after = await getSeries(page, root.id);
      expect(after.description).toBe(renamed);
      expect(Number(after.recurringAmount)).toBe(12.345);

      // Reopening shows the saved series, still at 12.345.
      const reopened = await openEditSeries(page, root.id, renamed);
      await expect(reopened.getByLabel("Amount")).toHaveValue("12.345");
      await expect(reopened.getByLabel("Description")).toHaveValue(renamed);
    } finally {
      // Put the fixture back so reruns find "Rent (monthly)" again.
      const restored = await page.request.patch(`/api/backend/transactions/${root.id}/recurring`, {
        data: { description: RENT },
      });
      expect(restored.ok(), `restoring the rent description failed with ${restored.status()}`).toBeTruthy();
    }

    const final = await getSeries(page, root.id);
    expect(final.description).toBe(RENT);
    expect(Number(final.recurringAmount)).toBe(12.345);
  });
});
