# Phase 9: Testing and hardening

**Model:** Opus 5.5, high for the security review; Sonnet 5.5, medium for tests · **Tokens:** ~0.3–0.5M · **Depends on:** Phase 8 · **Backend touched:** only for fixes found here

## Goal
Confidence that the app is correct and safe, and a release checklist ready for when store submission is wanted.

## Steps
1. **Unit/component coverage:** fill gaps in `src/api`, `src/core` ports, forms and money screens; every bug found gets a regression test.
2. **End-to-end flows with Maestro** (`frontend/mobile/.maestro/`): sign in with email, first-run setup, add a transaction, edit and delete with undo, Delete all data on a throwaway user. You run them on emulators; document the command in the README.
3. **Security review (Opus):**
   - Tokens: refresh token only in SecureStore, access token never persisted, nothing sensitive in logs, crash reports or React Query devtools.
   - Network: HTTPS only, no cleartext exceptions, no certificate-check bypass left from development, API URL not overridable at runtime.
   - Deep links can't trigger a destructive action; screens that need a session redirect when signed out.
   - Backend: rate limits behave with carrier-NAT traffic, the new routes can't be used for account enumeration, error messages don't leak.
   - Data at rest: nothing financial written to AsyncStorage except flags and the active-account choice; app snapshots hidden in the task switcher (optional setting).
   - iOS privacy manifest entries for the required-reason APIs used; Android permissions are the minimum.
4. **Performance:** cold start time, list scrolling on a mid-range Android, memory with a large transaction history.
5. Write `docs/mobile/RELEASE-CHECKLIST.md` for Phase 10.

## Done when
- Unit tests, `typecheck` and `lint` pass; Maestro flows pass on your emulators.
- The security review list is closed (each item fixed or explicitly accepted in PROGRESS.md).
- `RELEASE-CHECKLIST.md` exists.

## Manual QA (you)
Run the Maestro flows; install a release-mode build (`eas build --profile preview`) on one device and repeat the main flow.

## Suggested commits
- `test(mobile): add coverage for the API client, forms and money screens`
- `test(mobile): add Maestro flows for sign-in, onboarding and transactions`
- `fix(mobile): close the security review findings`
