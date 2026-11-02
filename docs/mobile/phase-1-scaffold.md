# Phase 1: Scaffold and toolchain spike

**Model:** Opus 5.5, high (version-compatibility risk) · **Tokens:** ~0.15–0.25M · **Depends on:** Phase 0 values in PROGRESS.md · **Backend touched:** no

## Goal
A blank Expo app in `frontend/mobile` that runs on the iOS Simulator, the Android emulator and `expo start --web`, with NativeWind and React Native Reusables working in light and dark. This phase also settles which versions work together.

## Read first
`docs/mobile/README.md`, `docs/mobile/PROGRESS.md` (Phase 0 values), `frontend/web/app/globals.css` (colour tokens).

## Steps
1. **Spike first.** Look up the current stable Expo SDK on expo.dev and the supported versions of NativeWind (v4) and React Native Reusables. If the newest SDK doesn't work with them, pin the newest SDK that does and record why in PROGRESS.md.
2. Create `frontend/mobile` with that SDK: TypeScript **strict**, Expo Router, path alias `@/` → `src/`. Use the app name, bundle id/package and scheme from PROGRESS.md in `app.config.ts`.
3. Add NativeWind v4 + Tailwind (`tailwind.config.js`, `metro.config.js`, `global.css`, babel preset). Run the React Native Reusables init; mount `PortalHost` **last** in the root layout.
4. Add three Reusables components with its CLI as a smoke test: `button`, `input`, `card`.
5. Copy the colour tokens from `frontend/web/app/globals.css` (light and `.dark`: background, foreground, card, primary lime `#cbe600` / dark `#d2f000`, primary-text, muted, border, destructive `#b91c1c` / dark `#ff5c5c`, etc.) into `src/theme` and the Tailwind config, with system/light/dark switching. Add the Inter font.
6. Jest with `jest-expo`, ESLint. Configuration split: **environment** values in `frontend/mobile/.env` with a committed `.env.example` (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; later `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`), read in one place (`src/config.ts`); app **identity** (name, bundle id, package, scheme, Expo owner, EAS project ID) committed in `app.config.ts`. Nothing secret ever gets an `EXPO_PUBLIC_` prefix (it is bundled into the app).
7. EAS: `eas init`, then `eas.json` with a `development` profile (development client). Get the Android dev keystore SHA-1: run `eas credentials` → Android → the `development` profile → set up a new keystore (EAS can generate it without a build); if that menu isn't offered, the first development build creates it. Record the SHA-1 in PROGRESS.md and tell the user, who then creates the Google **Android** OAuth client (package `com.sedky02.mofin` + this SHA-1) before Phase 4.
8. Add npm scripts: `start`, `ios`, `android`, `web`, `typecheck`, `lint`, `test`.
9. A single smoke screen showing a `Card` with an `Input` and a lime `Button`, plus a light/dark toggle.

## Rules
- Don't install anything that isn't needed yet (no auth, no React Query here).
- Keep the lime palette identical to the web's. The primary button text uses the dark `primary-foreground`.
- Record every version you pin (SDK, React Native, NativeWind, Tailwind, Reusables) in PROGRESS.md.

## Done when
- The app opens on iOS Simulator, Android emulator and Expo web.
- The Reusables button renders correctly in light and dark; colours match the web's tokens.
- `npm run typecheck && npm run lint && npm test` pass; `npx expo-doctor` is clean (or every warning is explained).

## Manual QA (you)
Open the development build on one emulator or device, toggle dark mode, check the button and input look right.

## Suggested commits
- `chore(mobile): scaffold the Expo app with Router, NativeWind and React Native Reusables`
- `chore(mobile): add the lime theme tokens, Jest, ESLint and the EAS development profile`
