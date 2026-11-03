# Maestro end-to-end flows

**Status: written, NOT run.** There was no emulator where these were authored, and the Maestro docs site was unreachable at the time, so the YAML follows Maestro's documented command syntax from memory (`launchApp`, `tapOn`, `inputText`, `runFlow` with `env`, `extendedWaitUntil`, `evalScript`). Expect to adjust selectors/timeouts on the first real run.

App id: `com.sedky02.mofin`. Selectors use accessibility labels/visible text (Maestro matches these as regex against the whole string) and a few `testID`s (`login-*`, `register-*`, `transaction-*`, `confirm-dialog-action`).

## Flows
| File | What | Needs |
|---|---|---|
| `sign-in-email.yaml` | Sign in with email; a wrong password stays on the sign-in screen | A finished user: `MAESTRO_EMAIL`, `MAESTRO_PASSWORD` |
| `first-run-setup.yaml` | Registers a new user, creates the first account, records the first transaction | `MAESTRO_NEW_PASSWORD` (8+ chars). Leaves a throwaway user on the backend |
| `add-transaction.yaml` | Records an expense from the Add tab, finds it in the list | A user with at least one account |
| `edit-delete-undo.yaml` | Creates, edits, deletes, undoes, deletes again | A user with at least one account |
| `delete-all-data.yaml` | Settings > Data > Delete data, typing `DELETE` | `MAESTRO_NEW_PASSWORD`. **Destructive**; makes its own throwaway user and never uses `MAESTRO_EMAIL` |

`subflows/` holds the shared steps and is not run on its own.

## Run
```bash
# 1. An emulator running, and a build installed: a preview APK (`eas build --profile preview --platform android`)
#    or a development build with the dev server running. A preview/release build is the more stable target:
#    the dev-client launcher screen is not handled by these flows.
# 2. Credentials via the environment (any MAESTRO_* variable is passed to the flows):
export MAESTRO_EMAIL=...            # a user that has finished setup (local seed: demo@mofin.app, see the backend seed docs)
export MAESTRO_PASSWORD=...
export MAESTRO_NEW_PASSWORD=...     # any 8+ character password for the throwaway users
cd frontend/mobile
maestro test .maestro                     # all flows
maestro test .maestro/add-transaction.yaml  # one flow
```
Point the build at a **local or throwaway backend** (`EXPO_PUBLIC_API_URL`), not production: the registration flows create users. Never commit credentials.
