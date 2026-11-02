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
- `category-icons.ts`: imports `lucide-react-native` instead of `lucide-react` (same icon keys).
- `form-errors.ts`: only the rewrites above (toast and `ApiClientError` come from mobile modules).
- `hooks/useAccounts.ts`: no `useHydrationSafe` wrapper. It exists for server-rendered HTML; the app has no SSR.
- `hooks/useUser.ts`: same, no `useHydrationSafe`.
- `hooks/useDrafts.ts`: the "View" toast action calls `router.push` (expo-router) instead of `window.location.assign`.

## Mobile-only counterparts (not copies, not compared)
- `src/lib/query-client.ts`: `STALE` and a `QueryClient` without the SSR dehydration settings.
- `src/lib/toast.ts`: a `sonner`-shaped facade; Phase 5 connects it to a real toast view.
- `src/api/client.ts`: `ApiClientError` and a placeholder `api`; Phase 4 makes it real.
- `src/hooks/useActiveAccount.ts`, `src/hooks/useStoredFlag.ts`: rewritten on AsyncStorage (no cookie mirror, no `storage` event).
- `src/core/currency-names.ts`: `Intl.DisplayNames` with a generated fallback table for runtimes without it (Hermes).
- `src/core/golden-money.ts` and `format.golden.test.ts`: golden strings for `formatMoney`.

## Not copied (web-bound)
`api`, `server-api`, `session-post`, `auth-cookies`, `bff-headers`, `download`, `form-stash`, `safe-next`, `session-hint`, `error-reporting`, `auth-feedback`, and the hooks `use-sidebar-collapsed`, `use-view-transition-router`, `use-media-query`, `use-hydrating`, `use-count-up`, `use-form-stash`, `useSetup`.
`useSetup` is rewritten in Phase 6c (it drives the web's setup flow).

## Known notes
- `decimal.ts` triggers the lint warning `import/no-named-as-default`. It is a verbatim copy, so the warning stays.
