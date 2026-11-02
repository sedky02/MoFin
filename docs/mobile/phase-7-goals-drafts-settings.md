# Phase 7: Goals, Drafts (AI), Settings

**Model:** Sonnet 5.5, medium; Opus 5.5, high for delete/security flows · **Tokens:** ~0.7–1.0M · **Depends on:** Phase 6 · **Backend touched:** no

## Goal
Feature parity with the rest of the web app: goals, AI drafts, the AI connector page and every setting.

## Read first
`frontend/web/app/(app)/goals`, `drafts`, `connect`, `settings`; `components/goals`, `components/drafts`, `components/settings`; `lib/goal-*`, `lib/draft-review`.

## Steps
1. **Goals:** list (active/archived), create/edit (type Balance/Income/Expense, account scope, target, fixed period or recurring monthly/yearly), progress ring with the web's standing rules (`goal-standing`, `goal-scope`, `cancelled-goals`), history per goal. Periods are shown as the web shows them.
2. **Drafts:** composer (one text box with example rows), pending/approved/rejected lists, review form (amount, category, accounts, date) with the web's `draft-review` precision rules, approve and reject, pending count badge on the tab. Nothing is saved as a transaction until the user approves.
3. **AI Connector:** the same instructions and links as the web page for Claude and ChatGPT (open in the browser), the connector URL with a copy button (`expo-clipboard`), connected apps status. The mobile app does not itself act as a connector.
4. **Settings**, one screen per section:
   - Profile (display name), preferences (primary currency, default/main account), appearance (system/light/dark).
   - Security: change password (not for Google/Apple-only accounts, same rule as web via `hasPassword`), sign out everywhere (`POST /auth/sessions/revoke-all`).
   - Connected AI apps with disconnect.
   - **Data:** export JSON/CSV (`/export`, saved with `expo-file-system`, shared with `expo-sharing`), then a red-warning **Delete all data** row (`POST /users/me/reset-data`, typed word `DELETE`).
   - **Delete account** (`DELETE /users/me`, typed word `DELETE`), clears the session and returns to sign-in.
5. Demo users: hide what the web hides (delete data/account, password, connect).

## Rules
- Delete flows: same endpoints, same typed-word confirmation, same wording as the web; run them through Opus review.
- Don't invent settings the web doesn't have.

## Done when
- Every web setting has a mobile equivalent, or a written reason it doesn't (in PROGRESS.md).
- Tests cover goal standing/progress display, the draft approve/reject flow, and the delete confirmation.
- `npm run typecheck && npm run lint && npm test` pass.

## Manual QA (you)
Create a goal and watch progress move after a transaction; send a draft and approve it; export a file and open it from the share sheet; run Delete all data on a throwaway account and confirm you stay signed in.

## Suggested commits
- `feat(mobile): add goals with progress and history`
- `feat(mobile): add drafts and the AI connector page`
- `feat(mobile): add settings, data export and the delete flows`
