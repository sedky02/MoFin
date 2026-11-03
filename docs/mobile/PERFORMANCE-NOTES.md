# Performance notes (Phase 9 step 4)

**Nothing here has been measured.** No device or emulator was available. This lists how to measure, and the places in the code most likely to matter. Measure a **release-mode** build (`eas build --profile preview`, or `npx expo start --no-dev --minify`) on a mid-range Android (for example 4 GB RAM, Snapdragon 6-series class); dev mode numbers are meaningless.

## How to measure
| What | Tool | How |
|---|---|---|
| Cold start | `adb shell am start -W -S com.sedky02.mofin/.MainActivity` (TotalTime / WaitTime), repeated 10x after `adb shell am force-stop`; compare to first frame of the dashboard with real data | Report the median, not the best |
| Cold start in the field | EAS Observe (`expo-observe`; see the `expo:eas-observe` skill): cold/warm launch, TTR, TTI, per-route metrics, via `eas observe:metrics-summary` | Needs adding `expo-observe` and a build; not installed now. Consider it in Phase 10 |
| JS thread / re-renders | React Native DevTools (open from the dev menu, `j` in the Expo CLI): Profiler tab (commit durations, why-did-render), Performance tab | Use a release-like build with `--no-dev` where possible; the profiler needs dev |
| Frame drops while scrolling | Android: Developer options > Profile HWUI rendering (bars) or `adb shell dumpsys gfxinfo com.sedky02.mofin framestats`; Perfetto (`adb shell perfetto`, or the on-device System Tracing app, then open in ui.perfetto.dev) for UI/JS thread timelines | Scroll the same list at the same speed 3 times |
| Memory | Android Studio Profiler (attach, heap + native), or `adb shell dumpsys meminfo com.sedky02.mofin` (TOTAL PSS) before/after a 5-minute session | Watch for growth after repeatedly opening list/detail |
| Bundle / startup JS | `npx expo export --platform android --dump-sourcemap` and a source-map explorer; Hermes bytecode size | Check what the dashboard route pulls in |

## Test data
Seed a user with a large history (for example 5,000 transactions over 3 years, several accounts and currencies, ~20 categories, some splits and recurring series) on a local backend. Without that, list and memory numbers say little.

## Hot spots found by reading the code
1. **Transactions list** (`src/components/transactions/transactions-screen.tsx`): `FlatList` with `initialNumToRender={12}`, `windowSize={7}`, `removeClippedSubviews` on Android, rows from `transaction-row.tsx` (a `MoneyAmount`, icon, nativewind classes). It is *paged* (numbered pages, `PAGE_SIZES` up to 100 rows), not infinite, so memory is bounded by page size, but the largest page size is the case to test. Watch: per-row `formatMoney` (Intl formatter creation is cached in `format.ts`, confirm it stays cached), `multiply` Decimal work per row, and rows being re-created when filters change. FlashList was considered and deferred (PROGRESS.md); revisit only if a 100-row page janks.
2. **Dashboard SVG charts** (`dashboard/hero-chart.tsx`, `donut.tsx`, `goal-ring.tsx`): `react-native-svg` bars/arcs. Cost grows with the number of months and categories; check the first-draw time and whether press-for-details re-renders the whole chart. Layout widths come from `onLayout`, so look for a second render pass.
3. **Query invalidation fan-out** (`hooks/useTransactions.ts` `invalidateMoney`): every create/edit/delete/undo invalidates transactions, ledger, analytics, search *and* goals. Active observers (dashboard cards, the list, goal rings) refetch together right after a save; on a slow network that is up to 5+ parallel requests and a re-render burst on the screen the user returns to. Account create/update invalidates accounts, ledger, analytics and goals. Measure time-to-settled after saving, and consider narrowing by scope or relying on `STALE` times (balances/goals 30 s, transactions 2 min, analytics 5 min) if it shows.
4. **Dashboard mount**: several queries start at once (accounts, user, balances, monthly summary, series, goals, recent). The dashboard waits for stored active account, accounts, user and balances before showing cards (PROGRESS.md), so cold-start-to-content is bounded by the slowest of those. Check on a throttled connection.
5. **Startup JS**: Inter font loading (`use-inter-font.ts`), the Intl polyfill (`lib/intl-polyfill.ts`), the 160+ entry currency-name table, lucide icons and zod schemas load before first render. Check the Hermes startup trace for the biggest modules. React Compiler is on (`experiments.reactCompiler`), so manual memoisation is not needed; do not add it without a profile.
6. **Toasts/haptics/offline banner** are cheap; the date picker and the Select/portal dialogs mount lazily (confirm in the profiler).

## Targets to agree before measuring (suggestions, not requirements)
Cold start to interactive dashboard < 2.5 s on the mid-range device; list scroll with no sustained frame time > 16 ms (60 Hz) on a 100-row page; PSS growth < 50 MB over a 5-minute session on the large history.
