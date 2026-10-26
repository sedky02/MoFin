# MoFin web

Next.js app: the UI plus a BFF proxy to the API. Setup, architecture and environment variables are in the [root README](../../readme.md). Read `AGENTS.md` before changing code, since this Next.js version has breaking changes.

## Commands

```bash
npm run dev      # http://localhost:3001
npm run build
npm start
npm run lint
npm test         # Vitest, no servers needed
```

## BFF

Browser calls go to `app/api/backend/[...path]`, which adds the access token from an httpOnly cookie and forwards to `BACKEND_URL`. Auth routes are under `app/api/auth/*` and handle login, register, refresh, logout, sessions and Google sign-in.

## Unit tests

Tests live next to the code as `*.test.ts(x)`. Component tests opt into jsdom with a `// @vitest-environment jsdom` line. `*.spec.ts` under `e2e/` belongs to Playwright.

## End-to-end checks

Playwright runs against servers you start yourself: backend on :3000 and `npm run dev` on :3001. Install the browser once with `npx playwright install chromium`.

- `npm run e2e:seed` creates (or tops up) the fixture user and data through the backend API. It is safe to run repeatedly. Credentials are written to `e2e/.auth/credentials.json` (gitignored).
- `npm run e2e` (same as `npx playwright test`) logs in, opens every route and runs axe on desktop and mobile viewports.
- `e2e/password-reset.spec.ts` reads the reset email from disk. Start the backend with `MAIL_CAPTURE_DIR=.mail-outbox` (development only). Set `E2E_MAIL_DIR` if that directory is somewhere other than `../../backend/.mail-outbox`.
- `npm run e2e:shots -- /dashboard` writes four PNGs (desktop and mobile, light and dark) to `e2e/.shots/` (gitignored).
