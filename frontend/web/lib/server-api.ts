// Server-side backend fetch for Server Component prefetching: calls BACKEND_URL directly with the
// access_token cookie; financial data is dynamic, never cached.
import { cookies, headers } from "next/headers";
import { ACCESS_COOKIE, BACKEND_URL } from "@/lib/auth-cookies";
import { bffHeaders } from "@/lib/bff-headers";

const BACKEND_TIMEOUT_MS = 8_000;

/**
 * Why a server prefetch failed. Carried as a field, not parsed from the
 * message: in production Next replaces a Server Component error's message.
 */
export type PrefetchFailureKind = "unauthorized" | "server" | "timeout" | "unreachable";

/**
 * Thrown for failures that aren't a routine missing or expired token: a 5xx, network error or
 * timeout (and, for callers opting in with `throwOnUnauthorized`, a 401).
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
  throwOnUnauthorized?: boolean;
};

/**
 * Only a full page load starts with an empty React Query cache, so only then is a server prefetch
 * worth waiting for; a client-side navigation already has the data.
 */
export async function isDocumentRequest(): Promise<boolean> {
  return (await headers()).get("sec-fetch-dest") !== "empty";
}

/**
 * Returns null for a routine, client-recoverable outcome (no token cookie, an expired one the
 * client refetches through the BFF); throws ServerPrefetchError for real failures.
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
