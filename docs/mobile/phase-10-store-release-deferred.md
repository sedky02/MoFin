# Phase 10: Store release (deferred)

**Status:** not planned in detail. The decision for now is **development builds only**. Revisit after Phase 9.

## Checklist to plan when it is wanted
- **Sign in with Apple** (deferred from Phases 3 and 4): needs the Apple Developer account. Backend: **GATE** for the `User.appleId String? @unique` migration, `POST /auth/apple` (verify the identity token with `jose` against Apple's keys, check `nonce`, handle first-sign-in-only name/email and relay addresses), `APPLE_CLIENT_ID` env. App: `expo-apple-authentication` button, equal in prominence to Google. Create the iOS Google client then too.
- Accounts: Apple Developer Program ($99/yr), Google Play Console ($25 once).
- Listings: name, subtitle/short description, screenshots per device size, icon, keywords, support URL, privacy policy URL.
- Privacy forms: App Store privacy "nutrition labels" and Play Data safety (the app handles financial data, email and account identifiers).
- **Re-check Apple App Review Guideline 4.8 (Login Services)** against Apple's live text before submitting. Sign in with Apple (first item above) must be offered next to Google; confirm it is as easy to find as Google and follows Apple's button rules.
- Account deletion in the app is required by both stores: it exists (Settings → Delete account); mention where to find it in the review notes.
- Demo account credentials for the reviewers (the "Try the demo" button helps).
- Release builds with EAS (`production` profile), versioning, release notes, staged rollout.
- Optional: crash reporting, analytics (decide privacy impact first).
