import { expect, test } from "@playwright/test";

// A 12.345 TND draft opens as 12.345 and approves as 12.345, not 12.34.
// Needs `npm run e2e:seed` (the TND account is "Dinar").
test.use({ locale: "en-US" });

const RAW = "B-83 dinar coffee 12.345";

test("a 12.345 TND draft opens as 12.345 and is recorded unrounded", async ({ page }) => {
  const accountsRes = await page.request.get("/api/backend/accounts");
  expect(accountsRes.ok(), `GET accounts failed with ${accountsRes.status()}`).toBeTruthy();
  const { data: accounts } = (await accountsRes.json()) as { data: { id: string; name: string }[] };
  const dinar = accounts.find((a) => a.name === "Dinar");
  expect(dinar, "fixture account \"Dinar\" not found: run `npm run e2e:seed`").toBeTruthy();

  const draftRes = await page.request.post("/api/backend/draft-transactions", {
    data: {
      rawInput: RAW,
      parsedData: {
        type: "EXPENSE",
        description: RAW,
        amount: "12.345",
        currency: "TND",
        occurredAt: new Date().toISOString(),
        fromAccountId: dinar!.id,
      },
      confidenceScore: 0.9,
    },
  });
  expect(draftRes.ok(), `POST draft failed with ${draftRes.status()}`).toBeTruthy();

  await page.goto("/drafts");
  const card = page.locator("div", { hasText: RAW }).filter({
    has: page.getByRole("button", { name: /Review & edit/ }),
  }).last();
  await card.getByRole("button", { name: /Review & edit/ }).click();
  await expect(page.getByLabel("Amount")).toHaveValue("12.345");

  await page.getByRole("button", { name: /Approve & record/ }).click();
  await expect(page.getByText(RAW)).toHaveCount(0);

  const res = await page.request.get("/api/backend/search/transactions", {
    params: { q: RAW, limit: 5, offset: 0 },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: { description: string; items: { amount: string }[] }[] };
  const tx = body.data.find((t) => t.description === RAW);
  expect(tx, "approved transaction not found").toBeTruthy();
  expect(tx!.items.length).toBeGreaterThan(0);
  for (const item of tx!.items) expect(Number(item.amount)).toBe(12.345);
});
