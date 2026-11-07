# MoFin mobile app (Expo): project brief

A native iOS + Android app that mirrors the MoFin web app. Built with **Expo** in `frontend/mobile`, UI from **React Native Reusables** (shadcn-style, NativeWind v4), sign-in with **email/password, Google and Apple**.

Work is split into phases. Each phase has its own brief (`phase-N-*.md`) that can be run in a fresh session. Track status in [PROGRESS.md](./PROGRESS.md).

## Locked decisions
- **Copy, not a shared package.** The mobile app owns a copy of the web's pure logic in `frontend/mobile/src/core`. A drift script reports differences from the web originals; it never overwrites.
- **UI:** React Native Reusables. Its components are copied into `src/components/ui`, so we own them.
- **Sign-in:** Google is added next to email/password. **Apple is deferred to Phase 10** (no Apple Developer account, and it is only needed for App Store review). The backend gets one new route and the dependency `jose` (approved).
- **Release target:** development builds only for now. Store submission and Sign in with Apple are Phase 10, deferred.
- **Backend:** already deployed on a public HTTPS URL (recorded in PROGRESS.md, Phase 0).

## Why the backend needs new routes
`POST /auth/google` takes an authorization **code** plus a **redirectUri** and exchanges it server-side with the *web* client's secret (`backend/src/modules/auth/auth.service.ts`, `loginWithGoogle`). That is safe only because the ID token comes straight from Google over TLS, which is why that method skips signature checks.

A phone gets an **ID token** from the native Google SDK on the device, with a different client ID and no redirect to our web. That token comes from an untrusted client, so a new route must verify its signature, issuer, audience, expiry and `email_verified` before issuing MoFin tokens. The old route cannot be loosened for this (anyone could forge a token). Apple will need the same later (plus a new `appleId` column), which is why it is part of the deferred Phase 10.

## Architecture
```
frontend/mobile/
  app/                    Expo Router: (auth)/…  (app)/(tabs)/…  stack screens
  src/core/               COPY of web logic (+ COPIED_FROM.md)
  src/api/                fetch client, token store (expo-secure-store), refresh logic
  src/hooks/              React Query hooks, copied from web and adapted to the mobile client
  src/components/ui/      React Native Reusables (via its CLI)
  src/components/<feature>/
  src/theme/              lime palette tokens copied from web globals.css (light + dark)
  scripts/core-drift.mjs
  eas.json, app.config.ts, tailwind.config.js, metro.config.js, global.css
```
- **Auth:** the app talks to the backend directly (no BFF). Access token (15 min) in memory. Refresh token (30 days) in `expo-secure-store`. Refresh tokens rotate on every use, with reuse detection and a 30 s grace (`auth.service.ts`, `ROTATION_GRACE_MS`). Refresh must be **single-flight**, or parallel 401s trip reuse detection and sign the user out.
- **Data:** same React Query, same query keys, same endpoints as the web.
- **Charts:** `react-native-svg` (the web draws bars and the donut with DOM elements).
- **Push notifications:** Expo Push, for connected-app drafts and recurring transactions (Settings > Notifications). Needs a development or EAS build, not Expo Go, and FCM credentials on Android (`eas credentials`, plus `google-services.json`). The backend sends only when `EXPO_PUSH_ENABLED=true`.
- **Out of scope for now:** offline writes, store submission.

## Rules for every phase
1. Work in the current checkout (the project's branch/PR workflow is paused). **Do not commit or push.** End each phase with a suggested one-line conventional commit message per logical group, no trailers, no mention of AI.
2. Don't edit `frontend/web` unless the phase says so. `frontend/web/AGENTS.md` applies to the web only.
3. **Backend work follows `backend/CLAUDE.md`:** ask before new dependencies, schema changes or architectural changes. Items marked **GATE** need an explicit yes first.
4. Finish with `npm run typecheck && npm run lint && npm test` in `frontend/mobile`. If the backend changed, also run `npm test && npm run test:e2e && npm run lint` there.
5. Update `docs/mobile/PROGRESS.md` (status, decisions made, anything left undone).
6. There are no iOS/Android simulators in the agent environment. Verify with jest, typecheck and Expo web (Playwright screenshots). Each phase lists **manual QA for you** to run on a device or emulator.
7. Mobile technical rules: keep tests and every non-route file out of `frontend/mobile/src/app` (every file there is a route); Testing Library for React Native 14 is async (`await render(...)`, `await fireEvent.press(...)`); install packages with `npx expo install`; never hand-edit `src/global.css` or `src/theme/colors.ts` (run `npm run theme:sync`).
8. Money, decimals and dates are correctness-critical. Use the copied `src/core` helpers; never reimplement formatting or arithmetic.

## Model guide (from the project's CLAUDE.md)
- **Opus 5.5, high:** toolchain risk, auth, tokens, backend, money/date correctness.
- **Sonnet 5.5, medium:** standard screens and components, tests, polish. At most 3 parallel agents.
- **Haiku 5.5, low:** copy, strings, icon mappings, small mechanical edits.

## How to start a phase in a fresh session
> Read `docs/mobile/README.md` and `docs/mobile/phase-N-<name>.md`. Check `docs/mobile/PROGRESS.md` for the previous phase's status and decisions. Implement the phase following its steps and rules; ask before any GATE; don't commit; finish with the verification list and suggested commit messages.

## Repo map (what the phases read)
| Need | Where |
|---|---|
| Web logic to copy | `frontend/web/lib/` (`format`, `decimal`, `types`, `query-keys`, `constants`, `dashboard-scope`, `onboarding`, `account-form`, `hero-headline`, `hero-chart-a11y`, `transaction-days`, `transaction-list-params`, `transaction-schema`, `transaction-edit`, `transaction-category`, `transaction-accounts`, `recurring-edit`, `recurring-series`, `goal-scope`, `goal-standing`, `cancelled-goals`, `balances`, `draft-review`, `category-icons`, `password-strength`, `connected-apps`, `form-errors`, `utils`) |
| Web logic NOT to copy | `api`, `server-api`, `session-post`, `auth-cookies`, `bff-headers`, `download`, `form-stash`, `safe-next`, `session-hint`, `error-reporting`, `auth-feedback` (Next/DOM/cookie bound) |
| Web hooks | `frontend/web/hooks/` (copy: `useAccounts`, `useTransactions`, `useGoals`, `useCategories`, `useAnalytics`, `useLedger`, `useSearch`, `useUser`, `useDrafts`, `useConnectedApps`, `useMainAccount`, `useSuggestedAccount`, `use-debounced-value`; rewrite: `useActiveAccount`, `useStoredFlag`, `useSetup`; skip: `use-sidebar-collapsed`, `use-view-transition-router`, `use-media-query`, `use-hydrating`, `use-count-up`, `use-form-stash`) |
| Web screens | `frontend/web/app/(app)/` (dashboard, accounts, categories, goals, drafts, transactions, settings, connect), `app/(auth)/` (login, register, forgot/reset password) |
| Web UI pieces | `frontend/web/components/` (`accounts`, `categories`, `common`, `dashboard`, `drafts`, `goals`, `onboarding`, `search`, `settings`, `shell`, `transactions`); skip `landing`, `brand` |
| Backend auth | `backend/src/modules/auth/` (`auth.controller.ts`, `auth.service.ts`), env in `backend/src/config/env.validation.ts` |
| Backend test style | `backend/test/delete-account.e2e-spec.ts` (in-memory Prisma that follows `schema.prisma`) |
| Demo sign-in | `POST /auth/demo` (`backend/src/modules/demo/demo.controller.ts`) |
| Token facts | access 15 m (`JWT_ACCESS_TTL`), refresh 30 d (`JWT_REFRESH_TTL`), rotation grace 30 s |
