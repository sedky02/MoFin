# Release checklist (Phase 10, store release, deferred)

Source: `phase-10-store-release-deferred.md`, `PROGRESS.md`, the `expo:eas-app-stores` skill. Nothing below has been done; tick items off when they are. Verify every EAS/store step against current docs on the day (they change often).

## 1. Accounts and consoles
- [ ] Apple Developer Program ($99/yr) enrolled; App Store Connect app record for `com.sedky02.mofin`.
- [ ] Google Play Console ($25 once) developer account; app created for package `com.sedky02.mofin`; identity/organisation verification done (can take days).
- [ ] Expo account `sedky02`; `npx eas-cli login`, `npx eas-cli init` run and the project id put in `app.config.ts` (`extra.eas.projectId`; currently read from `EAS_PROJECT_ID`).
- [ ] Who owns which login, and 2FA on all three.

## 2. EAS configuration
- [ ] `eas.json` today: `development` (dev client, internal, APK / iOS simulator), `preview` (internal APK), `production` (`autoIncrement`), `appVersionSource: remote`. Add: `submit.production` (Play service-account key path, App Store Connect API key or Apple ID/app id), per-profile `env`/`channel` if using EAS Update, `ios.resourceClass`/`android.buildType: "app-bundle"` for production (Play needs an AAB).
- [ ] Production `EXPO_PUBLIC_API_URL` (HTTPS only) and public client IDs set as EAS environment variables, not from a local `.env`. `EXPO_PUBLIC_*` ships inside the app: no secrets.
- [ ] `eas build --profile production` succeeds for both platforms; `npx expo-doctor` clean; run `eas build --profile preview` and the QA matrix first.
- [ ] EAS Update decision (OTA): channel/runtime version policy, or skip for v1.

## 3. Versioning and signing
- [ ] `version` in `app.config.ts` (marketing version, currently 1.0.0); build numbers managed remotely (`autoIncrement`).
- [ ] Android upload key: let EAS generate it, back up the credentials (`eas credentials`), enrol in Play App Signing; record the **SHA-1 of the upload key and the Play app-signing key** (both are needed for Google sign-in, section 6).
- [ ] iOS: distribution certificate and provisioning profile via EAS; push/other capabilities only if used (none now).

## 4. Privacy, data and permissions
- [ ] **iOS privacy manifest**: list the required-reason APIs actually used by the app and its pods (expo modules usually ship their own manifests; AsyncStorage, file timestamp, UserDefaults, system boot time are typical). Set `ios.privacyManifests` in `app.config.ts` where a dependency lacks one, and check the generated report in Xcode/App Store Connect after upload.
- [ ] **App Store privacy labels** and **Play Data safety form**: the app collects email, display name, account identifiers and financial data (accounts, balances, transactions, goals) linked to the user; optional Google identity; no ads, no tracking, no third-party analytics today (re-answer if crash reporting/analytics is added). Data in transit encrypted (HTTPS); users can request deletion in-app.
- [ ] Android permissions at the minimum: review the merged manifest of the production build (`INTERNET`, and whatever the libraries add; remove unused ones with `android.blockedPermissions`).
- [ ] Privacy policy URL (public, matches the forms) and support URL/email. Terms if wanted.
- [ ] Confirm the security-review list is closed in PROGRESS.md before submitting.

## 5. Store listing assets
- [ ] Name (MoFin), subtitle / short description, full description, keywords (iOS), category (Finance), age rating questionnaire, content rating (Play).
- [ ] Icon (1024 px iOS, 512 px Play), feature graphic 1024x500 (Play), screenshots per required device size (iPhone 6.9"/6.5", iPad if `supportsTablet` stays true, Android phone; tablet if offered), light and dark if desired, with demo data only.
- [ ] Decide `ios.supportsTablet: true` (currently on): then iPad screenshots and iPad layout QA are required.
- [ ] Release notes for 1.0.0; country/region availability; pricing (free).

## 6. Sign-in providers
- [ ] **Google**: web client ID `889358560279-...` is set. Create the **Android OAuth client** (package `com.sedky02.mofin` + SHA-1 of the EAS upload key, plus the Play app-signing SHA-1) and the **iOS OAuth client** (bundle id). Add the iOS client ID to `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and the `@react-native-google-signin/google-signin` config plugin (needs `iosUrlScheme`) in `app.config.ts`; rebuild. Test on a production-signed build (a debug SHA-1 will not work from the store).
- [ ] **Sign in with Apple** (required by App Review Guideline 4.8 when Google sign-in is offered; re-read Apple's live text): backend GATE for `User.appleId String? @unique` migration, `POST /auth/apple` (verify identity token with `jose`, check `nonce`, handle first-sign-in-only name/email and relay addresses), `APPLE_CLIENT_ID`; app: `expo-apple-authentication` button and plugin, as prominent as Google. Or remove Google on iOS.
- [ ] Email/password and "Try the demo" still work on production.

## 7. Backend and environment
- [ ] Backend deployed with the new routes; `POST /auth/google/id-token` with garbage returns 401 (not 500/503).
- [ ] Env: `GOOGLE_MOBILE_CLIENT_IDS` (comma-separated: web, Android and iOS client IDs the tokens' audience can be), `APPLE_CLIENT_ID` (when Apple is added), existing JWT/DB vars.
- [ ] Node version on Vercel >= 20.19 / 22.12 (the CommonJS build with `jose` needs it); `start:prod` points at `dist/main.js` while the build writes `dist/src/main.js` (PROGRESS.md): confirm production does not use it.
- [ ] Rate limits behave with carrier-NAT traffic (many users behind one IP); demo endpoint behaviour (it is disabled on the deployed backend today, `DEMO_DISABLED`): decide what reviewers use.
- [ ] Known backend items from PROGRESS.md: `updateProfile` should select `isDemo`/`expiresAt`/`createdAt`; email linking overwrites a different `googleId`; two simultaneous first Google sign-ins can 500.
- [ ] Backups and a way to roll back the backend independently of the app.

## 8. App Review notes
- [ ] A **demo account for reviewers** (email + password in the review notes, pre-filled with sample data, not subject to throttling), since the deployed "Try the demo" is disabled; or re-enable demo for review.
- [ ] Review notes: what the app does, that data is the user's own, **account deletion is in-app** (More > Settings > Delete account; Delete all data is under Settings > Data), the AI connector page is optional and explained, no in-app purchases.
- [ ] Apple: Guideline 5.1.1(v) account deletion present; 4.8 Sign in with Apple (above); financial-app disclosures (not a bank, no money movement). Google: Data safety, account deletion URL/in-app path declared in Play Console, Financial features declaration.

## 9. Crash reporting and analytics (decision needed)
- [ ] Decide: none for v1, `expo-observe` (EAS Observe, performance), or Sentry (`@sentry/react-native` is already in the Jest transform list but not installed). If any is added: scrub tokens and amounts, update the privacy forms and policy, and exclude it from React Query devtools output. Default recommendation: store consoles' crash reports only for v1.

## 10. Pre-release QA matrix (everything "not verified on a device" so far)
Run on at least: one mid-range Android (release build), one iPhone via TestFlight, one small and one large screen, light and dark, system font scale at default and the largest, and airplane mode.

| Area | Check | Source |
|---|---|---|
| Money formatting | Golden strings (`src/core/golden-money.ts`) render identically to the web: `$1,234.50`, `€1,234.50`, `1,234.500 TND`, `¥1,234`, negatives, compact `$1.2M` `€1.5K` `1.5K TND` (iOS Hermes ignores compact notation) | Phase 2 |
| Intl | `Intl.Locale`/`DisplayNames` presence, `formatToParts` stand-in on iOS, device currency guess from time zone | Phases 2, 6a |
| Dates | `new Date("YYYY-MM-DDTHH:mm:ss")` parsed as local time on Hermes; dates built from parts around DST and UTC month boundaries; date picker on both platforms | Phases 2, 6b |
| Amounts | `moneyInputHint` precision beyond ~15 digits; thousands separators and tidy-on-submit with the phone keyboard | Phase 2, 6b |
| Auth | Email sign-in/up/forgot; sign-out then relaunch shows sign-in; token refresh after backgrounding; Google sign-in (Android dev/prod build, iOS); Expo Go limits | Phases 1, 4 |
| Session at rest | Refresh token only in Keychain/Keystore; reinstall on iOS does not resume an old session | Phase 7 review |
| Screens | Dashboard, transactions list/filter/pages, detail, edit, recurring controls, goals, drafts, settings, accounts, categories render and scroll; empty/first-run states; Select positioning, iOS `FullWindowOverlay`, keyboard avoidance in dialogs and the transaction form | Phases 5, 6, 8 |
| First run | New user: setup step 1 and 2, skip, then dashboard (never seen in a browser or device, unit tests only) | Phase 6c |
| Delete flows | Delete all data and Delete account on a throwaway user; export JSON/CSV share sheet on both platforms; export file cleared after sharing | Phase 7 |
| Deep links | `mofin://transactions/<id>` and `mofin://transactions/new` from cold start and warm; signed-out goes to sign-in first | Phase 8 |
| Accessibility | VoiceOver and TalkBack through sign-in, add transaction, dashboard; focus order; largest font; form-error announcements; reduce motion; haptics | Phase 8 checklist |
| Offline | Airplane mode and back; offline banner under the Android status bar; actions fail gracefully | Phase 8 |
| Visuals | Icon, adaptive/monochrome icon, splash (light and dark), status bar, tablet widths (>= 640 px `sm:` heights overriding 44 pt targets) | Phase 8 |
| Performance | Numbers from `PERFORMANCE-NOTES.md` | Phase 9 |
| Maestro | All flows in `frontend/mobile/.maestro` pass on an emulator (written, never run) | Phase 9 |

## 11. Submit and roll out
- [ ] `eas build --profile production` for both; `eas submit` to TestFlight and the Play internal track; test the store-signed builds.
- [ ] Play: closed testing requirements for new personal accounts (testers/duration) if they apply; staged rollout (e.g. 10% > 50% > 100%). Apple: phased release.
- [ ] Monitor store crash reports and backend errors for the first days; keep the previous build's metadata to roll back.
