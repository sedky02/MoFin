# Phase 4: Mobile API client and auth screens

**Model:** Opus 5.5, high (tokens, sessions) · **Tokens:** ~0.35–0.5M · **Depends on:** Phases 1–3 · **Backend touched:** no

## Goal
The app can sign a user in (email, Google, demo), keep the session across launches, refresh it safely and sign out. (Apple sign-in is deferred to Phase 10.) Every later screen calls the backend through this client.

## Read first
`docs/mobile/README.md` (auth facts), `frontend/web/lib/api.ts` (error shape to keep), `frontend/web/app/(auth)/*` (screens and copy), `backend/src/modules/auth/auth.service.ts` (`refreshTokens`: rotation, reuse detection, 30 s grace), `frontend/web/app/api/backend/[...path]/route.ts` (the web's single-flight refresh to mirror).

## Steps
1. `src/api/client.ts`: `request<T>(path, opts)` like the web's, but to `EXPO_PUBLIC_API_URL` (already ends in `/api/v1`) with `Authorization: Bearer <access>`, `x-request-id`, JSON in/out, 204 handling, `ApiClientError` with the same fields (`status`, `body`, `validation`). Export `api.get/post/patch/put/delete` (the shape Phase 2's hooks already use) and `authApi` for the unauthenticated routes.
2. **Single-flight refresh.** On a 401, run one `POST /auth/refresh { refreshToken }` shared by every waiting request, then retry each once with the new access token. Persist the **rotated** refresh token before retrying. If refresh is rejected (401/400) or reuse is detected, clear SecureStore and the query cache and send the user to login.
3. Token store `src/api/session.ts`: refresh token in `expo-secure-store`; access token in memory only; `restoreSession()` on launch (refresh once, then load `/users/me`). Keep tokens out of logs, React Query keys and error messages.
4. Session provider + splash gate: show the splash until `restoreSession()` settles; route to `(auth)` or `(app)`. React Query `onlineManager` (NetInfo) and `focusManager` (AppState) wired.
5. Screens in `app/(auth)/` using the Phase 1 components: **login**, **register**, **forgot password** (calls the backend; the reset link in the email opens the web page via `Linking`), **Try the demo** (`POST /auth/demo`). Copy the web's field validation and error messages (`src/core/form-errors`).
6. **Google:** `@react-native-google-signin/google-signin` configured with `webClientId` (Web client from PROGRESS.md; the iOS client ID is added later). Send the returned `idToken` to `POST /auth/google/id-token`. Needs a development build (not Expo Go).
7. **Apple: not in this phase** (deferred to Phase 10; needs an Apple Developer account).
8. Sign out: `POST /auth/logout { refreshToken }`, then clear everything.

## Rules
- Parallel 401s must trigger **one** refresh; this is what keeps reuse detection quiet.
- Never store the refresh token outside SecureStore; never persist the access token.
- Don't copy the web's `redirectToLogin`; navigation goes through the router.

## Done when
- Unit tests: single-flight (five parallel 401s, one refresh call); rotated token persisted before retry; refresh rejected clears state and signs out; reuse-detected response signs out; request after sign-out doesn't resurrect the session; tokens never appear in logged output.
- Email sign-in, register, demo and sign-out work end to end against the deployed backend (verified through Expo web with a SecureStore fallback used for web only).
- `npm run typecheck && npm run lint && npm test` pass.

## Manual QA (you)
Android development build: Google sign-in, kill and reopen the app (still signed in), airplane mode then back (recovers). iPhone in Expo Go: email sign-in and the demo (Google needs a development build, which needs an Apple Developer account).

## Suggested commits
- `feat(mobile): add the API client with single-flight token refresh and secure session storage`
- `feat(mobile): add the sign-in, register, demo and password screens`
- `feat(mobile): add Google sign-in`
