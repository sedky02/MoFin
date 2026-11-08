# Publishing an Android build (before the Play Store)

People download the APK from the landing page ("Get the app") or Settings → Mobile app, and the app shows an "Update available" banner once a newer build is published. The newest build comes from the `AppRelease` table through `GET /app/releases/latest`.

## Each release

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
