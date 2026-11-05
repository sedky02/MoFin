# Copied from the web app

`src/core` is a copy of the web's pure logic in `frontend/web/lib`, plus the web's tests
(converted from vitest to jest). Do not "improve" it here: fix the web first, then re-copy.
Run `npm run core:drift` to compare (report only, it never overwrites).

- **Web commit:** `20feb387b834f0c6de534288483d9883954c6cba` (frontend/web at that commit)
- **Copied on:** 2026-11-03

## Mechanical rewrites (applied to every file, not listed below)
- `@/lib/<name>` -> `@/core/<name>`
- tests: the `vitest` import is removed (jest globals) and `vi.` becomes `jest.`
- `"use client";` is dropped from hooks
- `@/lib/api` -> `@/api/client`, `sonner` -> `@/lib/toast`

## Intentional differences
- `category-icons.ts`: imports its icons from `@/lib/icons` (per-file re-exports of `lucide-react-native`, see `scripts/sync-icons.mjs`) instead of `lucide-react` (same icon keys).
- `form-errors.ts`: only the rewrites above (toast and `ApiClientError` come from mobile modules).
- `hooks/useAccounts.ts`: no `useHydrationSafe` wrapper. It exists for server-rendered HTML; the app has no SSR.
- `hooks/useUser.ts`: no `useHydrationSafe`; and `useUpdateUser` merges the PATCH /users/me answer into the cached user instead of replacing it. That endpoint returns no `isDemo`/`expiresAt`/`createdAt`, so the web (which replaces) briefly shows demo-hidden controls too. Proper fix: select those fields in `backend/src/modules/users/users.service.ts` `updateProfile`, then drop this difference.
- `hooks/useDrafts.ts`: the "View" toast action calls `router.push` (expo-router) instead of `window.location.assign`. `useCreateDraftIntent` passes a 60 s `timeoutMs` (the model answers slower than the 15 s default; the web raises the same limit in its BFF proxy for `ai/*`).

## Mobile-only counterparts (not copies, not compared)
- `src/hooks/useAiChat.ts`: the saved "Ask" chats (list, detail, send, rename, delete) and `chatErrorMessage`. Same shape as `frontend/web/hooks/useAiChat.ts`, with a 60 s `timeoutMs` on send and `@/api/client` / `@/lib/toast` imports. Keep the two in step by hand.
- `src/components/ask/*`: the Ask screens. Same behaviour and wording as `frontend/web/components/ask/*` (suggestions, tool labels, chart colours, error messages), drawn with react-native-svg.
- `src/lib/query-client.ts`: `STALE` and a `QueryClient` without the SSR dehydration settings.
- `src/lib/toast.ts`: a `sonner`-shaped store (`id`, `description`, `duration`, `action`, `cancel`, `dismiss`); `src/components/toast-host.tsx` renders it.
- `src/api/client.ts`: `ApiClientError` and a placeholder `api`; Phase 4 makes it real.
- `src/hooks/useActiveAccount.ts`, `src/hooks/useStoredFlag.ts`: rewritten on AsyncStorage (no cookie mirror, no `storage` event).
- `src/lib/intl-polyfill.ts`: a `formatToParts` stand-in for Hermes on iOS (installed in the root layout), so `format.ts` stays a verbatim copy.
- `src/core/currency-names.ts`: `Intl.DisplayNames` with a generated fallback table for runtimes without it (Hermes).
- `src/core/golden-money.ts` and `format.golden.test.ts`: golden strings for `formatMoney`.

## Not copied (web-bound)
`api`, `server-api`, `session-post`, `auth-cookies`, `bff-headers`, `download`, `form-stash`, `safe-next`, `session-hint`, `error-reporting`, `auth-feedback`, and the hooks `use-sidebar-collapsed`, `use-view-transition-router`, `use-media-query`, `use-hydrating`, `use-count-up`, `use-form-stash`, `useSetup`.
`useSetup` is rewritten in Phase 6c (it drives the web's setup flow).

## Known notes
- `decimal.ts` triggers the lint warning `import/no-named-as-default`. It is a verbatim copy, so the warning stays.
- Hermes vs V8 (from the Phase 2 review, to confirm on a device): iOS ignores `notation: "compact"`; `Intl.Locale` and `Intl.DisplayNames` may be missing; `moneyInputHint` passes a decimal string to `format()`, which Hermes may round as a number beyond ~15 digits.
- `onboarding.guessCurrency` reads `navigator.languages`, which React Native lacks. Pass `DeviceHints` built from `expo-localization` (time zone, `regionCode`) from the setup screen (Phase 6c).
- `useSuggestedAccountId` (a verbatim copy) reads `useActiveAccount().accountId` before the stored pick is loaded. Forms that copy a default once must wait for `useActiveAccount().ready`, or call `loadActiveAccount()` behind the splash (Phase 4/6b).
- Golden tests run with the ICU locale pinned to en-US (`jest.global-setup.js`).
