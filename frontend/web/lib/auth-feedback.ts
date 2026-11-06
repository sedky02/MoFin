// Why /login opened. The login page maps the ?error= and ?reason= codes to fixed copy and never
// renders the query value itself (it comes from the URL).
import { safeNextPath, DEFAULT_AFTER_LOGIN } from "@/lib/safe-next";

export type LoginErrorCode = "google_failed" | "google_unconfigured";
export type LoginReason = "expired" | "signed_out" | "account_deleted";

const ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  google_failed: "Google sign-in didn't finish — try again or use email.",
  google_unconfigured: "Google sign-in isn't available right now — sign in with email instead.",
};
const UNKNOWN_ERROR_MESSAGE = "Sign-in didn't finish. Please try again.";

const REASON_MESSAGES: Record<LoginReason, string> = {
  expired: "Your session expired. Sign in to continue.",
  signed_out: "You've been signed out on every device. Sign in to continue.",
  account_deleted: "Your account and its data were deleted.",
};

export type LoginNotice = { kind: "error" | "info"; message: string };

export function loginNotice(params: URLSearchParams): LoginNotice | null {
  const error = params.get("error");
  if (error) {
    const message = Object.hasOwn(ERROR_MESSAGES, error)
      ? ERROR_MESSAGES[error as LoginErrorCode]
      : UNKNOWN_ERROR_MESSAGE;
    return { kind: "error", message };
  }
  const reason = params.get("reason");
  if (reason && Object.hasOwn(REASON_MESSAGES, reason)) {
    return { kind: "info", message: REASON_MESSAGES[reason as LoginReason] };
  }
  return null;
}

export function loginErrorUrl(code: LoginErrorCode, next?: string | null): string {
  const qs = new URLSearchParams({ error: code });
  const safe = safeNextPath(next);
  if (safe !== DEFAULT_AFTER_LOGIN) qs.set("next", safe);
  return `/login?${qs}`;
}
