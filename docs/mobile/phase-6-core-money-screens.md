# Phase 6: Core money screens

**Model:** Sonnet 5.5, medium; **Opus 5.5, high for the transaction form (6b)** · **Tokens:** ~0.9–1.3M total · **Depends on:** Phase 5 · **Backend touched:** no

Three sub-phases that can run in parallel (at most 3 agents; no worktrees since the branch workflow is paused, so keep their files separate). The end of this phase is the **core money app**: a new user can sign up, add an account, record a transaction and see it on the dashboard.

## Rules for the whole phase
- Money, decimals, dates and split lines are correctness-critical: use the copied `src/core` helpers and the web's zod schemas (`transaction-schema`, `account-form`); never reimplement.
- Months for the dashboard summary are **UTC** (as the web fixed it), day grouping is the user's local day.
- Screens call the same endpoints and query keys as the web; invalidation after mutations mirrors the web hooks.
- Verify visually through Expo web at **390 and 820 px** wide (screenshots), plus jest tests for logic.

## 6a: Accounts and categories
Read `frontend/web/app/(app)/accounts`, `categories`, `components/accounts`, `components/categories`.
- Accounts: list grouped by type (Bank, Cash, Savings, Crypto), balance per account, create/edit sheet (type picker, name that follows the type until edited, **device-guessed currency** via `src/core/onboarding.guessCurrency`, opening balance), archive/restore with confirm, "Archived" view.
- Categories: list by type, create/edit (name, type, colour from the palette, icon), archive/restore, usage count before delete; starter set is Food, Drinks, Rent, Subscriptions, Transport / Freelance, Salary, Allowance, Trade (created by the backend).
- Done when: create, edit, archive and restore work against the backend; empty states match the web.

## 6b: Transactions (Opus for the form)
Read `frontend/web/app/(app)/transactions`, `components/transactions`, `components/search`.
- List: search box, filter sheet (type, account, category, dates, amount range, recurrence, sort), day groups with the user's local day, page-number or infinite loading (use the web's `useSearchPage`), pull to refresh.
- Detail: all fields, delete with undo toast, recurring series controls (pause, resume, cancel, edit template).
- New/edit form: expense, income, transfer, optional split lines, recurring (interval, end date), same validation messages and rounding as the web. Default account follows the active account.
- Done when: every web transaction action exists; adding a transaction updates balances and lists without a reload; edge cases covered by tests (split totals, currency decimals, transfer between currencies refused as on the web).

## 6c: Dashboard and onboarding
Read `frontend/web/components/dashboard`, `components/onboarding`, `frontend/web/hooks/useSetup.ts`, `lib/onboarding.ts`.
- Dashboard: balance hero (currency switch, metric tabs, six-month chart in `react-native-svg`, change chip), monthly summary (month navigation, totals strip, donut with legend), goals card, recent transactions, the assistant nudge.
- Order on phones: **hero, monthly summary, goals, recent**.
- First run: the two-step setup (first account with currency guess, then first transaction with "Skip for now"), and the nothing-recorded state with the single "Record your first transaction" panel (two equal tiles).
- Loading skeletons with the same layout; no layout jump when data arrives.
- Done when: the dashboard matches the web for the same account and month (compare numbers), and a brand-new user completes setup unaided.

## Done when (whole phase)
- A new user signs up, adds an account, records a transaction and sees correct balances on the dashboard, on Expo web and on your device.
- `npm run typecheck && npm run lint && npm test` pass.

## Manual QA (you)
On device: complete first-run setup, add three transactions (one split, one transfer), check the chart and donut, switch accounts, rotate the phone, use a very large system font.

## Suggested commits
- `feat(mobile): add the accounts and categories screens`
- `feat(mobile): add the transactions list, detail and form`
- `feat(mobile): add the dashboard and first-run setup`
