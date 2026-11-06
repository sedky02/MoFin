// Idempotent fixture seed that goes through the HTTP API only, so every business rule applies.
// Runs under Node's built-in TS support: no enums, parameter properties or local imports.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.BACKEND_URL ?? "http://localhost:3000/api/v1";
const EMAIL = process.env.UX_FIXTURE_EMAIL ?? "ux-fixture@mofin.test";
const PASSWORD = process.env.UX_FIXTURE_PASSWORD ?? "UxFixture#2026";
const DISPLAY_NAME = "UX Fixture";
// Africa/Tunis is UTC+1 all year; the backend has no timezone field, so it lives in profile settings.
const TZ = { timezone: "Africa/Tunis", utcOffsetMinutes: 60 };

const here = dirname(fileURLToPath(import.meta.url));
const authDir = resolve(here, "../e2e/.auth");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

let token = "";

async function call(method: string, path: string, body?: unknown, auth = true): Promise<Json> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  }
  return data;
}

async function listAll(path: string): Promise<Json[]> {
  const out: Json[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let offset = 0; ; offset += 100) {
    const page = await call("GET", `${path}${sep}limit=100&offset=${offset}`);
    const rows: Json[] = page.data ?? [];
    out.push(...rows);
    if (rows.length < 100 || out.length >= (page.total ?? Infinity)) break;
  }
  return out;
}

function localDate(monthsAgo: number, day: number, hour = 10): string {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const maxDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(day, maxDay);
  return new Date(Date.UTC(y, m, d, hour - TZ.utcOffsetMinutes / 60, 0, 0)).toISOString();
}

async function login(): Promise<void> {
  // Register answers identically whether or not the email exists.
  await call("POST", "/auth/register", { email: EMAIL, password: PASSWORD, displayName: DISPLAY_NAME }, false);
  const tokens = await call("POST", "/auth/login", { email: EMAIL, password: PASSWORD }, false);
  token = tokens.accessToken;
}

async function seed() {
  await login();
  console.log(`Logged in as ${EMAIL}`);

  await call("PATCH", "/users/me", { displayName: DISPLAY_NAME, settings: TZ });
  const accountDefs = [
    { name: "Main checking", type: "BANK", currency: "USD" },
    { name: "Emergency fund", type: "SAVINGS", currency: "USD" },
    { name: "Travel wallet", type: "CASH", currency: "EUR" },
    { name: "Dinar", type: "BANK", currency: "TND", metadata: { decimals: 3 } },
    { name: "Old savings", type: "SAVINGS", currency: "EUR" },
  ];
  const existingAccounts = await listAll("/accounts?status=all");
  const acc: Record<string, Json> = {};
  for (const def of accountDefs) {
    acc[def.name] =
      existingAccounts.find((a) => a.name === def.name) ?? (await call("POST", "/accounts", def));
  }
  const categoryDefs = [
    { name: "Salary", type: "INCOME" },
    { name: "Freelance", type: "INCOME" },
    { name: "Groceries", type: "EXPENSE" },
    { name: "Rent", type: "EXPENSE" },
    { name: "Dining out", type: "EXPENSE" },
    { name: "Transport", type: "EXPENSE" },
    { name: "Subscriptions", type: "EXPENSE" },
    { name: "Utilities", type: "EXPENSE" },
  ];
  const existingCategories = await listAll("/categories");
  const cat: Record<string, Json> = {};
  for (const def of categoryDefs) {
    cat[def.name] =
      existingCategories.find((c) => c.name === def.name && c.type === def.type) ??
      (await call("POST", "/categories", def));
  }
  // A transaction counts as existing when description + timestamp match.
  const existingTx = await listAll("/search/transactions");
  const txKey = (description: string, occurredAt: string) =>
    `${description}|${new Date(occurredAt).toISOString()}`;
  const seen = new Map<string, Json>(existingTx.map((t) => [txKey(t.description, t.occurredAt), t]));
  let created = 0;

  async function ensureTx(body: Json): Promise<{ tx: Json; isNew: boolean }> {
    const key = txKey(body.description, body.occurredAt);
    const found = seen.get(key);
    if (found) return { tx: found, isNew: false };
    const tx = await call("POST", "/transactions", body);
    seen.set(key, tx);
    created++;
    return { tx, isNew: true };
  }

  const mainId = acc["Main checking"].id;
  const emergencyId = acc["Emergency fund"].id;
  const travelId = acc["Travel wallet"].id;
  const dinarId = acc["Dinar"].id;
  const oldId = acc["Old savings"].id;

  await ensureTx({
    type: "INCOME", description: "Old savings opening deposit", amount: "800.00", currency: "EUR",
    occurredAt: localDate(4, 2), toAccountId: oldId,
  });
  await ensureTx({
    type: "INCOME", description: "Travel wallet top-up", amount: "300.00", currency: "EUR",
    occurredAt: localDate(3, 4), toAccountId: travelId,
  });
  await ensureTx({
    type: "INCOME", description: "Dinar cash deposit", amount: "2500.000", currency: "TND",
    occurredAt: localDate(4, 3), toAccountId: dinarId,
  });

  for (let m = 4; m >= 0; m--) {
    await ensureTx({
      type: "INCOME", description: "Monthly salary", amount: "3200.00", currency: "USD",
      occurredAt: localDate(m, 1), toAccountId: mainId, categoryId: cat["Salary"].id,
    });
    await ensureTx({
      type: "TRANSFER", description: "Emergency fund transfer", amount: "500.00", currency: "USD",
      occurredAt: localDate(m, 2), fromAccountId: mainId, toAccountId: emergencyId,
    });
    await ensureTx({
      type: "EXPENSE", description: "Groceries run", amount: `${180 + m * 7}.50`, currency: "USD",
      occurredAt: localDate(m, 6), fromAccountId: mainId, categoryId: cat["Groceries"].id,
    });
    await ensureTx({
      type: "EXPENSE", description: "Dinner out", amount: `${42 + m * 3}.00`, currency: "USD",
      occurredAt: localDate(m, 8), fromAccountId: mainId, categoryId: cat["Dining out"].id,
    });
    await ensureTx({
      type: "EXPENSE", description: "Transit pass", amount: "35.00", currency: "USD",
      occurredAt: localDate(m, 3), fromAccountId: mainId, categoryId: cat["Transport"].id,
    });
    await ensureTx({
      type: "EXPENSE", description: "Streaming bundle", amount: "14.99", currency: "USD",
      occurredAt: localDate(m, 9), fromAccountId: mainId, categoryId: cat["Subscriptions"].id,
    });
    await ensureTx({
      type: "EXPENSE", description: "Electricity and water", amount: `${88 + m * 2}.25`, currency: "USD",
      occurredAt: localDate(m, 11), fromAccountId: mainId, categoryId: cat["Utilities"].id,
    });
  }
  await ensureTx({
    type: "INCOME", description: "Freelance logo project", amount: "650.00", currency: "USD",
    occurredAt: localDate(2, 14), toAccountId: mainId, categoryId: cat["Freelance"].id,
  });
  await ensureTx({
    type: "INCOME", description: "Freelance website fix", amount: "420.00", currency: "USD",
    occurredAt: localDate(0, 5), toAccountId: mainId, categoryId: cat["Freelance"].id,
  });
  await ensureTx({
    type: "EXPENSE", description: "Souvenirs", amount: "27.40", currency: "EUR",
    occurredAt: localDate(1, 12), fromAccountId: travelId, categoryId: cat["Dining out"].id,
  });

  const { tx: split } = await ensureTx({
    type: "EXPENSE", description: "Supermarket and pharmacy receipt", amount: "96.30", currency: "USD",
    occurredAt: localDate(0, 4), fromAccountId: mainId,
    items: [
      { amount: "71.30", categoryId: cat["Groceries"].id, memo: "Food" },
      { amount: "25.00", categoryId: cat["Utilities"].id, memo: "Household" },
    ],
  });

  // Deleted rows aren't searchable, so each run records and deletes a fresh one.
  const { tx: deleted, isNew: deletedIsNew } = await ensureTx({
    type: "EXPENSE", description: "Duplicate charge (deleted)", amount: "59.00", currency: "USD",
    occurredAt: localDate(0, 7), fromAccountId: mainId, categoryId: cat["Dining out"].id,
  });
  if (deletedIsNew) await call("DELETE", `/transactions/${deleted.id}`);

  await ensureTx({
    type: "EXPENSE", description: "Rent (monthly)", amount: "12.345", currency: "TND",
    occurredAt: localDate(4, 5), fromAccountId: dinarId, categoryId: cat["Rent"].id,
    isRecurring: true, recurringInterval: "MONTHLY",
  });

  if (!acc["Old savings"].archivedAt) {
    await call("DELETE", `/accounts/${oldId}`);
  }
  const periodStart = localDate(0, 1, 0);
  const goalDefs = [
    { name: "Freelance income target", type: "INCOME", targetAmount: "1000.00", accountId: mainId },
    { name: "Monthly spending cap", type: "EXPENSE", targetAmount: "300.00", accountId: mainId },
    { name: "Emergency fund target", type: "BALANCE", targetAmount: "5000.00", accountId: emergencyId },
  ];
  const existingGoals = await listAll("/goals?status=all");
  for (const def of goalDefs) {
    if (existingGoals.some((g) => g.name === def.name)) continue;
    await call("POST", "/goals", { ...def, isRecurring: true, recurrenceUnit: "MONTH", periodStart });
  }
  const draftDefs = [
    {
      rawInput: "coffee with Sam 6.50",
      parsedData: {
        type: "EXPENSE", description: "Coffee with Sam", amount: "6.50", currency: "USD",
        occurredAt: localDate(0, 1, 15), fromAccountId: mainId, categoryId: cat["Dining out"].id,
      },
      confidenceScore: 0.92,
    },
    {
      rawInput: "got paid 120 for tutoring",
      parsedData: {
        type: "INCOME", description: "Tutoring session", amount: "120.00", currency: "USD",
        occurredAt: localDate(0, 1, 16), toAccountId: mainId, categoryId: cat["Freelance"].id,
      },
      confidenceScore: 0.55,
    },
  ];
  const existingDrafts = await listAll("/draft-transactions");
  for (const def of draftDefs) {
    if (existingDrafts.some((d) => d.rawInput === def.rawInput)) continue;
    await call("POST", "/draft-transactions", def);
  }
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    resolve(authDir, "credentials.json"),
    JSON.stringify({ email: EMAIL, password: PASSWORD }, null, 2) + "\n",
  );
  writeFileSync(
    resolve(authDir, "fixture.json"),
    JSON.stringify(
      {
        sampleTransactionId: split.id,
        accounts: Object.fromEntries(Object.entries(acc).map(([name, a]) => [name, a.id])),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Fixture ready (${created} transactions created). Credentials: e2e/.auth/credentials.json`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
