# Phase 8: Native polish and accessibility

**Model:** Sonnet 5.5, medium · **Tokens:** ~0.3–0.5M · **Depends on:** Phase 7 · **Backend touched:** no

## Goal
The app feels native and is usable with a screen reader, large text and either theme.

## Steps
1. **Feel:** pull-to-refresh on lists and the dashboard, light haptics on primary actions and destructive confirmations, keyboard-aware forms (inputs never hidden, "next/done" keys, tap outside to dismiss), `FlashList` for long lists, optimistic updates where the web has them (archive).
2. **Identity:** app icon, adaptive Android icon, splash screen (lime palette), status bar per theme.
3. **Links:** deep links on the `mofin://` scheme (open a transaction, the new-transaction form). Password-reset links stay on the web page for now.
4. **Connectivity:** offline banner using React Query's `onlineManager`, calm error states with retry, no crash on timeouts (the backend answers 429/504 as on the web).
5. **Optional:** biometric app lock (`expo-local-authentication`) behind a Settings switch, off by default.
6. **Accessibility pass:** VoiceOver and TalkBack labels for charts (reuse `hero-chart-a11y`), headings, form errors announced, focus order, minimum 44 pt targets, dynamic type up to the largest setting without clipped text.
7. **Contrast:** reuse the web's 4.5:1 rules in both themes, in particular lime on white (use the olive outline treatment for lime surfaces on white) and the destructive red.

## Rules
- Haptics and animations respect the system "reduce motion" setting.
- Don't add features the web doesn't have, other than the optional biometric lock.

## Done when
- A written accessibility checklist (in PROGRESS.md) is ticked on iOS and Android.
- `npm run typecheck && npm run lint && npm test` pass.

## Manual QA (you)
One iPhone (or Simulator) and one Android device: VoiceOver/TalkBack through sign-in, add transaction and dashboard; largest font size; dark mode; airplane mode and back.

## Suggested commits
- `feat(mobile): add pull-to-refresh, haptics, keyboard handling and list performance`
- `feat(mobile): add the app icon, splash, deep links and offline banner`
- `fix(mobile): accessibility labels, focus order and contrast across both themes`
