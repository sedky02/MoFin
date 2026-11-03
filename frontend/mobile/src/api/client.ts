// The app's backend client. Every screen and hook calls the backend through `api` (signed-in
// routes) or `authApi` (the routes that start or end a session). Same error shape as the web's
// client (ApiClientError with status, body, validation).
//
// On a 401 the client asks session.ts for a new access token (one shared refresh for every waiting
// request) and retries the request once. If the refresh is refused, the session ends and the root
// layout's route guard shows sign-in; there is no redirect from here.
import { ApiClientError, send, newRequestId, type SearchParams } from '@/api/http';
import { getAccessToken, hasSession, refreshSession, signOut, type AuthTokens } from '@/api/session';

export { ApiClientError } from '@/api/http';
export type { AuthTokens } from '@/api/session';

const SESSION_EXPIRED = 'Session expired.';
// Same copy as the web BFF's answer when a refresh could not be completed right now.
const REFRESH_UNAVAILABLE = "Couldn't refresh your session right now. Please try again.";

// Seeding a demo writes a few hundred rows, so it gets longer than a login (as on the web).
const DEMO_TIMEOUT_MS = 30_000;

type RequestOpts = { body?: unknown; searchParams?: SearchParams };

/** A fresh access token, or an ApiClientError for the caller when there is none to be had. */
async function renewAccessToken(): Promise<string> {
  const outcome = await refreshSession();
  if (outcome.kind === 'ok') return outcome.accessToken;
  if (outcome.kind === 'unavailable') {
    throw new ApiClientError(503, REFRESH_UNAVAILABLE, { statusCode: 503, message: REFRESH_UNAVAILABLE });
  }
  throw new ApiClientError(401, SESSION_EXPIRED, { statusCode: 401, message: SESSION_EXPIRED });
}

async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
  const requestId = newRequestId();
  // Signed in but no access token yet (launched offline, or memory only had the refresh token).
  if (!getAccessToken() && hasSession()) await renewAccessToken();

  const sentWith = getAccessToken();
  try {
    return await send<T>(method, path, { ...opts, accessToken: sentWith, requestId });
  } catch (err) {
    if (!(err instanceof ApiClientError) || err.status !== 401 || !sentWith) throw err;
  }

  // 401: the access token expired. If another request already refreshed while this one was in
  // flight, just use its token; otherwise join (or start) the one shared refresh.
  const current = getAccessToken();
  const next = current && current !== sentWith ? current : await renewAccessToken();
  // Retry once. A second 401 is returned to the caller as is.
  return send<T>(method, path, { ...opts, accessToken: next, requestId });
}

export const api = {
  get: <T>(path: string, searchParams?: SearchParams) => request<T>('GET', path, { searchParams }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
};

/** POST /auth/demo: a temporary demo user (or the visitor's existing one). */
export type DemoSession = AuthTokens & { expiresAt: string; reused: boolean };

/**
 * The unauthenticated auth routes. They return the backend's answer; starting the session from a
 * token pair is session.ts's `startSession`, and ending one is its `signOut`.
 */
export const authApi = {
  login: (body: { email: string; password: string }) => send<AuthTokens>('POST', '/auth/login', { body }),
  /** Always the same message whether or not the email was new; no tokens (sign in afterwards). */
  register: (body: { email: string; password: string; displayName?: string }) =>
    send<{ message: string }>('POST', '/auth/register', { body }),
  /** 202 with the same message whether or not the email has an account. */
  forgotPassword: (body: { email: string }) => send<{ message: string }>('POST', '/auth/password/forgot', { body }),
  demo: () => send<DemoSession>('POST', '/auth/demo', { body: {}, timeoutMs: DEMO_TIMEOUT_MS }),
  /** Native Google sign-in: the ID token the device got from Google, verified by the backend. */
  googleIdToken: (idToken: string) => send<AuthTokens>('POST', '/auth/google/id-token', { body: { idToken } }),
  // Refresh and logout use the session's stored token, so they go through session.ts: a second,
  // uncoordinated POST /auth/refresh would trip the backend's reuse detection and sign the user out.
  /** The single-flight refresh (POST /auth/refresh with the stored token). */
  refresh: refreshSession,
  /** POST /auth/logout with the stored token, and clears the session on this device. */
  logout: signOut,
};
