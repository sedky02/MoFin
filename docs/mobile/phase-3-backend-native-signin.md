# Phase 3: Backend, native Google sign-in

**Model:** Opus 5.5, high (auth, backend) · **Tokens:** ~0.15–0.3M · **Depends on:** Phase 0 · **Backend touched:** yes · **Mobile touched:** no

**Apple is deferred to Phase 10** (no Apple Developer account). So there is no schema change and no GATE in this phase.

## Goal
One new public backend route that accepts a native Google ID token from the phone, verifies it properly, and answers with the same token pair as email login: `POST /auth/google/id-token`.

## Read first
`docs/mobile/README.md` ("Why the backend needs new routes"), `backend/CLAUDE.md`, `backend/src/modules/auth/auth.service.ts` (`loginWithGoogle`, `issueTokens`), `auth.controller.ts`, `backend/src/config/env.validation.ts`, `backend/test/delete-account.e2e-spec.ts` (test harness style).

## Steps
1. **Dependency `jose`** is approved. Add it to the backend only.
2. A verifier service (e.g. `auth/id-token-verifier.service.ts`) built on `createRemoteJWKSet` with Google's keys (`https://www.googleapis.com/oauth2/v3/certs`). Check signature, `iss` (`accounts.google.com` or `https://accounts.google.com`), `aud` against an allow-list, `exp`, and `email_verified === true`. Keep it generic enough that Apple can plug in later (issuer, JWKS URL, audiences as inputs).
3. Extract the "link by Google id, else by email, else create user" logic out of `loginWithGoogle` into one shared method, and reuse it for both the code flow and the new route. No copy-paste. The existing `POST /auth/google` (code flow) must keep working unchanged.
4. Route `POST /auth/google/id-token` body `{ idToken }`: `@Public()`, `@UseGuards(AuthThrottlerGuard)`, zod DTO like the other auth routes, same response shape as login via `issueTokens`.
5. Env (validated in `env.validation.ts`, optional so the app still boots without it; the route answers 503 "not configured" like the existing Google one): `GOOGLE_MOBILE_CLIENT_IDS`, comma-separated, containing the web client ID (with `webClientId` set in the app, the token's `aud` is the web client) and later the iOS client. Document it in `.env.example` and the readme env table.
6. Tests:
   - Unit: verifier with a local JWKS (`createLocalJWKSet`) and tokens signed in the test: valid; wrong `aud`; wrong `iss`; expired; bad signature; unverified email; unknown key id.
   - Service: new user created; existing email gets the Google id linked; same `sub` signs into the same account.
   - E2E in the in-memory-DB style: the route returns the login response shape, rate limiting applies, a forged token gets 401 and creates nothing.

## Rules
- Never trust a client-supplied token without signature verification; never decode-only.
- Don't log tokens or full claims.
- Leave `POST /auth/google` (code flow) and the web untouched.

## Done when
- Backend `npm test`, `npm run test:e2e`, `npm run lint` and `nest build` pass.
- A real-Postgres scenario (as done for `reset-data`) proves: forged token gets 401; a valid token creates or links one user, and the returned refresh token works at `POST /auth/refresh`.

## Manual QA (you)
Deploy the backend (it runs on Vercel), set `GOOGLE_MOBILE_CLIENT_IDS` in its environment, and confirm `POST /auth/google/id-token` with garbage answers 401 (not 500/503). The real-token check happens in Phase 4.

## Suggested commits
- `feat(api): verify native Google ID tokens and sign users in with them`
