# Phase 5: App shell and UI kit

**Model:** Sonnet 5.5, medium · **Tokens:** ~0.3–0.5M · **Depends on:** Phases 1, 2, 4 · **Backend touched:** no

## Goal
The signed-in app frame (tabs, header, account switcher, theme) and every reusable building block the screens need, proven on a hidden "kitchen sink" screen in light and dark.

## Read first
`docs/mobile/README.md`, `frontend/web/components/shell/` (navigation, account switcher, user menu), `frontend/web/components/common/` (money, states, dialogs), `frontend/web/components/ui/` (what the web uses).

## Steps
1. Expo Router structure: `app/(auth)/…`, `app/(app)/(tabs)/` with tabs **Dashboard, Transactions, Add, Goals, More**, plus stack screens for details and forms. "Add" opens the new-transaction form (modal). "More" lists Accounts, Categories, Drafts, AI Connector, Settings.
2. Header with the **account switcher** (All accounts or one account) driven by the Phase 2 `useActiveAccount`; light/dark/system theme in More → Settings later.
3. Add Reusables with its CLI: `dialog`, `alert-dialog`, `select`, `tabs`, `badge`, `skeleton`, `switch`, `separator`, `label`, `textarea`, a toast solution. Keep their API; restyle only through tokens.
4. Port shared pieces to `src/components/common/`: `MoneyAmount`, `MoneyInput` (reuse `src/core` normalising), `CurrencyPicker` (search, "In use" group, uses the Hermes-safe currency names), `EmptyState`, `ErrorState`, skeletons, `PageHeader`, `TypeToConfirmDialog`, `AccountTypePicker`.
5. Hidden route `app/(app)/_dev/kitchen-sink` (only in `__DEV__`) showing every primitive, in light and dark, with loading, empty and error states.
6. Accessibility from the start: every pressable has `accessibilityRole` and a label; hit areas at least 44×44 pt; text scales with the system font size.

## Rules
- No business logic in components: formatting and rules come from `src/core`.
- Reuse the web's copy and labels exactly, unless a mobile idiom needs a change (note it in PROGRESS.md).
- Respect safe areas (notch, home indicator) with `react-native-safe-area-context`.

## Done when
- Kitchen sink renders all primitives without warnings in light and dark (Expo web screenshots at 390 and 820 wide attached to PROGRESS.md notes).
- Tab navigation and the account switcher work against the real backend.
- `npm run typecheck && npm run lint && npm test` pass (component tests for `MoneyInput`, `CurrencyPicker`, `TypeToConfirmDialog`).

## Manual QA (you)
Scroll the kitchen sink on a small and a large phone, in both themes, with larger system text.

## Suggested commits
- `feat(mobile): add the tab shell, header and account switcher`
- `feat(mobile): add the shared money, picker and state components with a dev kitchen sink`
