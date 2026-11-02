# MoFin mobile (Expo)

iOS + Android app that mirrors the MoFin web app. Plan, rules and per-phase briefs: [`docs/mobile`](../../docs/mobile/README.md).

## Run it
```bash
cp .env.example .env     # API URL and the public Google web client ID
npm install
npm start                # then press a / w, or scan the QR with Expo Go (iPhone)
```
- **Expo Go** (phone) runs everything except native Google sign-in, which needs a development build.
- **Development build (Android):** `npx eas-cli login`, `npx eas-cli build --profile development --platform android`.
- Web preview for quick visual checks: `npm run web`.

## Scripts
| Script | What |
|---|---|
| `npm run typecheck` / `lint` / `test` | TypeScript, ESLint (`expo lint`), Jest (`jest-expo`) |
| `npm run doctor` | `expo-doctor` dependency and config check |
| `npm run theme:sync` | Regenerate `src/global.css` and `src/theme/colors.ts` from the web app's `globals.css` |
| `npm run theme:check` | Fail if those files are out of date (the Jest suite checks this too) |

## Conventions
- `src/app` holds **routes only** (every file there is a screen, tests included). Components, hooks and logic live elsewhere under `src/`.
- Install packages with `npx expo install <pkg>` so versions match the SDK.
- Colors come from the generated theme; don't hand-edit `src/global.css` or `src/theme/colors.ts`.
- App identity (name, bundle id, package, scheme) is in `app.config.ts`; environment values are in `.env` (see `.env.example`) and read only in `src/config.ts`. Anything `EXPO_PUBLIC_*` ships inside the app: never put a secret there.
- UI components come from React Native Reusables: `npx @react-native-reusables/cli@latest add <component> -y --styling-library nativewind`.
