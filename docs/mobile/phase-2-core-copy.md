# Phase 2: Core copy (the "copy package")

**Model:** Sonnet 5.5, medium; Opus reviews money/date parity · **Tokens:** ~0.2–0.3M · **Depends on:** Phase 1 · **Backend touched:** no

## Goal
`frontend/mobile/src/core` holds a verified copy of the web's pure logic (types, money, dates, rules), with the web's tests ported, plus a script that reports drift from the web originals.

## Read first
`docs/mobile/README.md` (repo map of what to copy and what to skip), the web tests next to each file.

## Steps
1. Copy these from `frontend/web/lib/` into `src/core/` (same file names): `format`, `decimal`, `types`, `query-keys`, `constants`, `dashboard-scope`, `onboarding`, `account-form`, `hero-headline`, `hero-chart-a11y`, `transaction-days`, `transaction-list-params`, `transaction-schema`, `transaction-edit`, `transaction-category`, `transaction-accounts`, `recurring-edit`, `recurring-series`, `goal-scope`, `goal-standing`, `cancelled-goals`, `balances`, `draft-review`, `category-icons`, `password-strength`, `connected-apps`, `form-errors`, `utils`.
   - Change only: `@/lib/...` imports to the mobile alias, and remove anything importing `next/*`, `window`, `document` or `localStorage`.
   - `category-icons` imports `lucide-react`: swap to `lucide-react-native` and keep the same keys.
   - **Skip** the files marked "not to copy" in the README.
2. Copy each file's unit test too, converting vitest to jest (`vi.` to `jest.`). The same assertions must pass.
3. Write `src/core/COPIED_FROM.md`: the web commit hash (`git rev-parse HEAD`), the date, and the list of intentional differences per file.
4. `scripts/core-drift.mjs` (`npm run core:drift`): for each copied file, compare against the web original after normalising the known import rewrites, and print `same`, `drifted` or `missing`. Report only; never overwrite. Exit code 1 if any file is `drifted` without an entry in COPIED_FROM.md.
5. Hooks: in `src/hooks/`, copy the React Query hooks listed in the README ("copy") and point them at `src/api` (a stub `api` with the same `get/post/patch/put/delete` shape for now; Phase 4 implements it). Rewrite `useActiveAccount` and `useStoredFlag` on AsyncStorage (`useSyncExternalStore` pattern is fine). Skip the hooks marked "skip".
6. **Hermes check.** `Intl.NumberFormat` (currency, `compact`, `formatToParts`) and `Intl.DisplayNames` (used for currency names) may behave differently on Hermes. Add fallbacks (a small currency-name table) and **golden-string tests** for a fixed set: USD, EUR, TND (3 decimals), JPY (0 decimals), negative amounts, compact amounts, large numbers.

## Rules
- Do not "improve" the copied logic. If something looks wrong, note it in COPIED_FROM.md and fix it in the web first.
- Money stays decimal-string based (`decimal.ts`); never use floats for arithmetic.

## Done when
- All ported tests pass under jest; `npm run core:drift` shows no unexplained drift.
- Golden-string tests pass (they run in Node, so the on-device check below confirms Hermes).
- `npm run typecheck && npm run lint && npm test` pass.

## Manual QA (you)
Render the golden strings on a real device (a temporary screen is fine) and confirm they match the web for the same inputs.

## Suggested commits
- `feat(mobile): copy the web's pure logic and tests into src/core with a drift check`
- `feat(mobile): add the React Query hooks and AsyncStorage-backed flags`
