// Compares src/core (and the copied hooks) against the web originals and reports
// same / drifted / missing. Report only: it never writes a file.
// Exit code 1 when a file is drifted (or missing) and COPIED_FROM.md has no entry for it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.resolve(root, '../web');

// Copied pure logic: src/core/<name>.ts  <-  web/lib/<name>.ts
const CORE = [
  'format', 'decimal', 'types', 'query-keys', 'constants', 'dashboard-scope', 'onboarding',
  'account-form', 'hero-headline', 'hero-chart-a11y', 'transaction-days', 'transaction-list-params',
  'transaction-schema', 'transaction-edit', 'transaction-category', 'transaction-accounts',
  'recurring-edit', 'recurring-series', 'goal-scope', 'goal-standing', 'cancelled-goals', 'balances',
  'draft-review', 'category-icons', 'password-strength', 'connected-apps', 'form-errors', 'utils', 'week',
];
// Copied tests: src/core/<name>.test.ts  <-  web/lib/<name>.test.ts (web name in the value)
const TESTS = {
  format: 'format', 'dashboard-scope': 'dashboard-scope', onboarding: 'onboarding',
  'hero-headline': 'hero-headline', 'hero-chart-a11y': 'hero-chart-a11y',
  'transaction-days': 'transaction-days', 'transaction-edit': 'transaction-edit',
  'transaction-category': 'transaction-category', 'recurring-edit': 'recurring-edit',
  'recurring-series': 'recurring-series', 'goal-scope': 'goal-scope', 'goal-standing': 'goal-standing',
  'cancelled-goals': 'cancelled-goals', balances: 'balances', 'draft-review': 'draft-review',
  'category-icons': 'category-icons', 'password-strength': 'password-strength',
  'connected-apps': 'connected-apps', 'transaction-list': 'transaction-list', week: 'week',
};
// Copied hooks: src/hooks/<name>.ts  <-  web/hooks/<name>.ts
const HOOKS = [
  'useAccounts', 'useTransactions', 'useGoals', 'useCategories', 'useAnalytics', 'useLedger',
  'useSearch', 'useUser', 'useDrafts', 'useConnectedApps', 'useMainAccount', 'useSuggestedAccount',
  'use-debounced-value',
];

/** The known, mechanical import rewrites. Everything else is a real difference. */
function normalizeWebSource(text) {
  return text
    .replace(/^"use client";\n\n?/, '')
    .replace(/@\/lib\/api"/g, '@/api/client"')
    .replace(/from "sonner"/g, 'from "@/lib/toast"')
    .replace(/@\/lib\/(?!query-client|toast)/g, '@/core/')
    // Icons come from the app's per-file re-exports (scripts/sync-icons.mjs), not the lucide barrel.
    .replace(/from "lucide-react";/g, 'from "@/lib/icons";')
    .replace(/^import \{ [^}]* \} from "vitest";\n/m, '')
    .replace(/\bvi\./g, 'jest.');
}

function documented() {
  const file = path.join(root, 'src/core/COPIED_FROM.md');
  if (!existsSync(file)) return new Set();
  const names = new Set();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^- `([^`]+)`/);
    if (m) names.add(m[1]);
  }
  return names;
}

const entries = [
  ...CORE.map((n) => ({ label: `core/${n}.ts`, mobile: `src/core/${n}.ts`, web: `lib/${n}.ts` })),
  ...Object.entries(TESTS).map(([n, w]) => ({
    label: `core/${n}.test.ts`, mobile: `src/core/${n}.test.ts`, web: `lib/${w}.test.ts`,
  })),
  ...HOOKS.map((n) => ({ label: `hooks/${n}.ts`, mobile: `src/hooks/${n}.ts`, web: `hooks/${n}.ts` })),
];

const known = documented();
let unexplained = 0;
const rows = [];
for (const e of entries) {
  const mobilePath = path.join(root, e.mobile);
  const webPath = path.join(webRoot, e.web);
  let status;
  if (!existsSync(mobilePath) || !existsSync(webPath)) status = 'missing';
  else {
    const a = normalizeWebSource(readFileSync(webPath, 'utf8'));
    const b = readFileSync(mobilePath, 'utf8');
    status = a === b ? 'same' : 'drifted';
  }
  const explained = known.has(e.label);
  if (status !== 'same' && !explained) unexplained += 1;
  rows.push(`${status.padEnd(8)} ${e.label}${status !== 'same' ? (explained ? '  (documented)' : '  (NOT documented)') : ''}`);
}

console.log(rows.join('\n'));
const counts = rows.reduce((acc, r) => ((acc[r.split(' ')[0]] = (acc[r.split(' ')[0]] ?? 0) + 1), acc), {});
console.log(`\n${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}; ${unexplained} unexplained`);
if (unexplained > 0) {
  console.log('Add an entry "- `<label>`: why" to src/core/COPIED_FROM.md, or fix it in the web first.');
  process.exit(1);
}
