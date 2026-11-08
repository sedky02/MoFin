# Publishing an Android build (before the Play Store)

People download the APK from the landing page ("Get the app") or Settings → Mobile app, and the app shows an "Update available" banner once a newer build is published. The newest build comes from the `AppRelease` table through `GET /app/releases/latest`.

## Setup (once)

1. Make a token: `openssl rand -hex 32`.
2. Set it as `APP_RELEASE_TOKEN` in the backend's environment on Vercel, and redeploy. Without it, the publish routes answer 404.
3. Apply the migration to production: `DATABASE_URL="<production url>" npx prisma migrate deploy` (from `backend/`).
4. Keep the same token in your shell, e.g. `export APP_RELEASE_TOKEN=…` in a local, uncommitted file you source.

## One command (recommended)

From `frontend/mobile/`:

```sh
npm run release:android -- --dry-run                         # preview the version and notes
APP_RELEASE_TOKEN="…" npm run release:android               # build, publish, tag
```

**Versioning is automatic.** The script reads the commits since the last `android-v*` tag that touch `frontend/mobile` or `backend`, and bumps like semantic-release:

- a breaking change (`feat!:`, `fix(x)!:`, or a `BREAKING CHANGE:` footer) → major;
- any `feat:` → minor;
- anything else → patch;
- no commits → it stops (use `--force` to release anyway).

It publishes through the backend (`POST /app/releases` with `Authorization: Bearer $APP_RELEASE_TOKEN`), never the database directly. Set `RELEASE_API_URL` to target another backend (default: production).

The "What's new" notes are the `feat:` then `fix:` subjects (up to 5). After a successful publish it tags the commit `android-v<version>` locally (push it with `git push origin <tag>`) and asks you to commit the version change in `app.config.ts`.

Overrides: `--bump major|minor|patch`, `--version 1.2.3`, `--note "…"` (repeatable). Also `--legacy` (adds the 32-bit APK) and `--skip-publish` (build only).

## Each release, by hand

1. Bump `version` in `frontend/mobile/app.config.ts` (e.g. `1.0.3`). The build number (versionCode) is managed by EAS (`appVersionSource: remote`, `autoIncrement`).
2. Build:
   ```sh
   cd frontend/mobile
   eas build -p android --profile production-arm64
   # optional, for older 32-bit phones:
   eas build -p android --profile production-legacy
   ```
3. On expo.dev, open each build and copy:
   - the artifact (APK) URL;
   - the **version code** (build number).
4. Publish it, from `backend/`, with `DATABASE_URL` pointing at the production database:
   ```sh
   npm run app-release:publish -- --platform android --version 1.0.3 --build 12 \
     --url https://expo.dev/artifacts/eas/....apk \
     --legacy-url https://expo.dev/artifacts/eas/....apk \
     --note "Update banner" --note "Faster sync"
   ```
   The build number must be higher than every build published before, withdrawn ones included.
5. The web and the app pick it up within about 5 minutes (the endpoint's cache). No redeploy is needed.

## Pulling a bad build

```sh
npm run app-release:withdraw -- --platform android --build 12
```

The previous build becomes the latest again. The row stays in the table for history.

## Notes

- Updating installs over the old app and keeps people signed in, as long as every build is signed with the same EAS keystore. Never reset the Android credentials on EAS, or people will have to uninstall first.
- iPhone shows "Coming soon" until there's an Apple Developer account (Phase 10).
