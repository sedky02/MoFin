import { safeNextPath } from "@/lib/safe-next";
import { PENDING_INVITE_KEY } from "@/lib/account-sharing";

// Where to go once the email is verified: the link usually opens in a new tab, which has lost the
// sign-up page's query string.
const CONTINUE_KEY = "mofin_after_verify";

interface Continuation {
  next?: string;
  mcpAuthorize?: string;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Keeps `next` / `mcp_authorize` from the current URL for after verification. */
export function rememberContinuation(params: URLSearchParams): void {
  const continuation: Continuation = {
    next: params.get("next") ?? undefined,
    mcpAuthorize: params.get("mcp_authorize") ?? undefined,
  };
  try {
    localStorage.setItem(CONTINUE_KEY, JSON.stringify(continuation));
  } catch {
    // Private mode: the user lands on the dashboard instead.
  }
}

function readContinuation(): Continuation {
  try {
    return JSON.parse(readStorage(CONTINUE_KEY) ?? "{}") as Continuation;
  } catch {
    return {};
  }
}

/** The /check-email URL for an address, carrying the MCP bridge and `next` params along. */
export function checkEmailUrl(email: string, reason: "signup" | "signin", params: URLSearchParams): string {
  const url = new URLSearchParams({ email, reason });
  for (const key of ["next", "mcp_authorize"]) {
    const value = params.get(key);
    if (value) url.set(key, value);
  }
  return `/check-email?${url}`;
}

/** Where a freshly signed-in browser goes: the MCP bridge, a pending invitation, or `next`. */
export function afterVerificationHref(): string {
  const { next, mcpAuthorize } = readContinuation();
  if (mcpAuthorize) return `/api/auth/mcp-handoff?continue=${encodeURIComponent(mcpAuthorize)}`;
  if (readStorage(PENDING_INVITE_KEY)) return "/invitations/accept";
  return safeNextPath(next);
}

export function forgetContinuation(): void {
  try {
    localStorage.removeItem(CONTINUE_KEY);
  } catch {
    // Nothing stored.
  }
}
