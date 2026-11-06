// Every screen and hook calls the backend through `api` (signed-in routes) or `authApi` (routes
// that start or end a session). Same error shape as the web's client.
import { ApiClientError, send, newRequestId, type SearchParams, type TextResponse } from '@/api/http';
import { getAccessToken, hasSession, refreshSession, signOut, type AuthTokens } from '@/api/session';

export { ApiClientError } from '@/api/http';
export type { TextResponse } from '@/api/http';
export type { AuthTokens } from '@/api/session';

const SESSION_EXPIRED = 'Session expired.';
// Same copy as the web BFF's answer when a refresh could not be completed right now.
const REFRESH_UNAVAILABLE = "Couldn't refresh your session right now. Please try again.";

// Seeding a demo writes a few hundred rows, so it gets longer than a login (as on the web).
const DEMO_TIMEOUT_MS = 30_000;

type RequestOpts = { body?: unknown; searchParams?: SearchParams; responseType?: 'json' | 'text' };

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
  post: <T>(path: string, body?: unknown, opts?: { timeoutMs?: number }) => request<T>('POST', path, { body, ...opts }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string, body?: unknown, opts?: { timeoutMs?: number }) => request<T>('DELETE', path, { body, ...opts }),
  download: (path: string, searchParams?: SearchParams) =>
    request<TextResponse>('GET', path, { searchParams, responseType: 'text' }),
};

export type DemoSession = AuthTokens & { expiresAt: string; reused: boolean };

/**
 * Unauthenticated routes return the backend's answer; starting a session from a token pair is
 * session.ts's `startSession`, ending one its `signOut`.
 */
export const authApi = {
  login: (body: { email: string; password: string }) => send<AuthTokens>('POST', '/auth/login', { body }),
  /** Always the same message whether or not the email was new; no tokens (sign in afterwards). */
  register: (body: { email: string; password: string; displayName?: string }) =>
    send<{ message: string }>('POST', '/auth/register', { body }),
  /** 202 with the same message whether or not the email has an account. */
  forgotPassword: (body: { email: string }) => send<{ message: string }>('POST', '/auth/password/forgot', { body }),
  demo: () => send<DemoSession>('POST', '/auth/demo', { body: {}, timeoutMs: DEMO_TIMEOUT_MS }),
  googleIdToken: (idToken: string) => send<AuthTokens>('POST', '/auth/google/id-token', { body: { idToken } }),
  // Refresh and logout use the session's stored token, so they go through session.ts: a second,
  // uncoordinated POST /auth/refresh would trip the backend's reuse detection and sign the user out.
  refresh: refreshSession,
  logout: signOut,
};
