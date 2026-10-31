// Server-side backend fetch for Server Component prefetching (dashboard).
// Calls BACKEND_URL directly with the access_token cookie. All financial data is
// dynamic — never cached, never wrapped in "use cache" (it is user-specific).
import { cookies, headers } from "next/headers";
import { ACCESS_COOKIE, BACKEND_URL } from "@/lib/auth-cookies";
import { bffHeaders } from "@/lib/bff-headers";

/** Server-to-server calls must never hang indefinitely (audit PERF-XX). */
const BACKEND_TIMEOUT_MS = 8_000;

/**
 * Why a server prefetch failed. Carried as a field, not parsed from the
 * message: in production Next replaces a Server Component error's message.
 */
export type PrefetchFailureKind = "unauthorized" | "server" | "timeout" | "unreachable";

/**
 * Thrown by serverGet for a failure that is NOT a routine "no/expired access
 * token" outcome: a 5xx, a network error or a timeout (and, only for callers
 * that opt in with `throwOnUnauthorized`, a 401). The `kind` tells the caller
 * which one it was, so it can render a precise state instead of a generic
 * error or a confident, wrong "$0.00" dashboard.
 */
export class ServerPrefetchError extends Error {
  constructor(
    message: string,
    readonly kind: PrefetchFailureKind = "server",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ServerPrefetchError";
  }

  get timedOut() {
    return this.kind === "timeout";
  }
}

export type ServerGetOptions = {
  /**
   * Throw a ServerPrefetchError (kind "unauthorized") on a 401 instead of
   * returning null. For pages that render their own signed-out state.
   */
  throwOnUnauthorized?: boolean;
};

/**
 * Whether this render answers a full page load rather than a client-side
 * navigation. Only a page load starts with an empty React Query cache, so only
 * then is a server prefetch worth waiting for; on a navigation the client
 * already holds the data and refetches what is stale in the background.
 * Uses Fetch Metadata: browsers send `Sec-Fetch-Dest: document` for a page load
 * and `empty` for the router's fetches (Next strips its own RSC headers before
 * headers() sees them). A request without the header counts as a page load.
 */
export async function isDocumentRequest(): Promise<boolean> {
  return (await headers()).get("sec-fetch-dest") !== "empty";
}

/**
 * Fetch JSON from the backend on the server. Returns null for a routine,
 * client-recoverable outcome: no access token cookie, a 401 from an expired
 * one (the client query re-fetches through the proxy, which performs the
 * refresh), or any other 4xx (e.g. 404) that the calling page's own
 * client-side query already knows how to render (not found, forbidden, ...).
 * Only a genuine backend outage — a network error, a timeout or a 5xx — throws
 * ServerPrefetchError, since silently returning null for THAT would render as
 * an empty/zero dashboard indistinguishable from "the user has no data".
 */
export async function serverGet<T>(
  path: string,
  searchParams?: Record<string, string | number | undefined>,
  options: ServerGetOptions = {},
): Promise<T | null> {
  const cookieStore = await cookies(); // Next.js 16: async
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  const qs = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
  }
  const clean = path.startsWith("/") ? path : `/${path}`;
  const url = `${BACKEND_URL}${clean}${qs.toString() ? `?${qs}` : ""}`;

  // Counts the prefetch against the browser's IP, not this server's.
  const upstream = bffHeaders(await headers());

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        // Lets this prefetch be traced across both processes' logs (audit OBS-01).
        "x-request-id": crypto.randomUUID(),
        ...upstream,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ServerPrefetchError(
      timedOut ? `Backend timed out for ${clean}` : `Could not reach the backend for ${clean}`,
      timedOut ? "timeout" : "unreachable",
      err,
    );
  }

  if (res.status >= 500) {
    throw new ServerPrefetchError(`Backend returned ${res.status} for ${clean}`, "server");
  }
  if (res.status === 401 && options.throwOnUnauthorized) {
    throw new ServerPrefetchError(`Backend rejected the session for ${clean}`, "unauthorized");
  }
  if (!res.ok) return null;
  return (await res.json()) as T;
}
