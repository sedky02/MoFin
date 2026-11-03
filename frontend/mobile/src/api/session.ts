// The signed-in session: the access token (memory only), the refresh token (memory + token-store),
// and the status the root layout routes on.
//
// The backend rotates the refresh token on every use and treats a second use of an old token as
// theft (reuse detection revokes the whole family; a 30 s grace covers exact retries). So:
// - refreshSession() is single-flight: every caller waiting on a 401 shares one POST /auth/refresh;
// - the rotated token is saved before anyone retries with the new access token;
// - each session has a generation number, and a refresh that finishes after a sign-out (or a new
//   sign-in) is thrown away and revoked instead of bringing the old session back.
//
// Never log, toast or put a token in a query key. Errors here carry statuses, not tokens.
import * as React from 'react';

import { ApiClientError, send } from '@/api/http';
import { tokenStore } from '@/api/token-store';
import type { User } from '@/core/types';

/** The pair login, register-then-login, demo, Google and refresh all return. */
export type AuthTokens = { accessToken: string; refreshToken: string };

export type SessionStatus = 'restoring' | 'signedIn' | 'signedOut';
/** Why the last session ended: the user signed out, or the backend refused the refresh token. */
export type SessionEndReason = 'signed_out' | 'expired';
export type SessionState = { status: SessionStatus; endReason?: SessionEndReason };

export type RefreshOutcome =
  | { kind: 'ok'; accessToken: string }
  /** The backend refused the token (invalid, expired, reused) or there is no session: signed out. */
  | { kind: 'rejected' }
  /** Rate limited, 5xx, timeout or offline. Says nothing about the token, so the session is kept. */
  | { kind: 'unavailable' };

const LOGOUT_TIMEOUT_MS = 8_000;

let state: SessionState = { status: 'restoring' };
let accessToken: string | undefined;
let refreshToken: string | undefined;
let generation = 0;
let refreshing: Promise<RefreshOutcome> | undefined;
let restoring: Promise<{ user: User | null }> | undefined;

const stateListeners = new Set<() => void>();
const endListeners = new Set<(reason: SessionEndReason) => void>();

function setState(next: SessionState) {
  state = next;
  stateListeners.forEach((l) => l());
}

export function getSessionState(): SessionState {
  return state;
}

export function subscribeSession(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Runs whenever a session ends (sign-out, rejected refresh). The app clears its caches here. */
export function onSessionEnd(listener: (reason: SessionEndReason) => void): () => void {
  endListeners.add(listener);
  return () => {
    endListeners.delete(listener);
  };
}

export function useSession(): SessionState {
  return React.useSyncExternalStore(subscribeSession, getSessionState, getSessionState);
}

export function getAccessToken(): string | undefined {
  return accessToken;
}

/**
 * This device's refresh token, for the one signed-in route that has to name its own session:
 * POST /auth/password/change keeps that token's family and revokes every other one. Never log,
 * toast or store it anywhere else.
 */
export function currentRefreshToken(): string | undefined {
  return refreshToken;
}

/** True while there is a refresh token to use (signed in, possibly without a live access token). */
export function hasSession(): boolean {
  return refreshToken !== undefined;
}

function isTokens(value: unknown): value is AuthTokens {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as AuthTokens).accessToken === 'string' &&
    typeof (value as AuthTokens).refreshToken === 'string'
  );
}

function warnNotSaved() {
  // No token in the message: only that saving failed.
  console.warn('MoFin: could not save the session to secure storage; it will last until the app closes.');
}

/** Best-effort revoke of a refresh token's family (sign-out, or a refresh result nobody wants). */
function revoke(token: string): Promise<void> {
  return send<void>('POST', '/auth/logout', { body: { refreshToken: token }, timeoutMs: LOGOUT_TIMEOUT_MS }).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Starts a session from a token pair (login, demo, Google). The refresh token is saved before the
 * status flips, so the app never shows a signed-in screen for a session that won't survive a restart
 * unless secure storage itself failed.
 */
export async function startSession(tokens: AuthTokens): Promise<void> {
  if (!isTokens(tokens)) throw new Error('The sign-in response had no session.');
  generation += 1;
  const gen = generation;
  refreshing = undefined;
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  try {
    await tokenStore.setRefreshToken(tokens.refreshToken);
  } catch {
    warnNotSaved();
  }
  if (gen !== generation) return; // signed out while saving
  setState({ status: 'signedIn' });
}

/** Forgets the session on this device. Returns once the stored token is deleted. */
function endSession(reason: SessionEndReason): Promise<void> {
  generation += 1;
  refreshing = undefined;
  accessToken = undefined;
  refreshToken = undefined;
  const cleared = tokenStore.clear().catch(() => {});
  if (state.status !== 'signedOut') {
    setState({ status: 'signedOut', endReason: reason });
    endListeners.forEach((l) => {
      try {
        l(reason);
      } catch {
        /* a cache clear must never stop the sign-out */
      }
    });
  }
  return cleared;
}

/**
 * Signs out: forgets the session here at once (memory, secure storage, then the app's caches via
 * onSessionEnd) and revokes it on the backend with POST /auth/logout. The local clear goes first so
 * nothing can refresh the session while the logout call is in flight, and an offline sign-out still
 * signs out; the logout revokes the whole token family, including any token rotated meanwhile.
 */
export async function signOut(): Promise<void> {
  const token = refreshToken;
  await Promise.all([endSession('signed_out'), token ? revoke(token) : undefined]);
}

/**
 * Exchanges the refresh token for a new pair. Single-flight: concurrent callers get the same promise,
 * so the backend sees one refresh however many requests hit a 401 together.
 */
export function refreshSession(): Promise<RefreshOutcome> {
  if (refreshing) return refreshing;
  const token = refreshToken;
  if (token === undefined) return Promise.resolve({ kind: 'rejected' });
  const gen = generation;
  const run: Promise<RefreshOutcome> = runRefresh(token, gen).finally(() => {
    if (refreshing === run) refreshing = undefined;
  });
  refreshing = run;
  return run;
}

async function runRefresh(token: string, gen: number): Promise<RefreshOutcome> {
  let tokens: unknown;
  try {
    tokens = await send<AuthTokens>('POST', '/auth/refresh', { body: { refreshToken: token } });
  } catch (err) {
    if (gen !== generation) return { kind: 'rejected' };
    // 401 covers invalid, expired, reused and "this demo has ended"; 400 a malformed token.
    if (err instanceof ApiClientError && [400, 401, 403].includes(err.status)) {
      await endSession('expired');
      return { kind: 'rejected' };
    }
    return { kind: 'unavailable' };
  }

  if (!isTokens(tokens)) return gen === generation ? { kind: 'unavailable' } : { kind: 'rejected' };

  if (gen !== generation) {
    // Signed out (or into another session) while this was in flight: don't bring it back.
    void revoke(tokens.refreshToken);
    return { kind: 'rejected' };
  }

  // Save the rotated token BEFORE anyone retries with the new access token: if the app dies after
  // the retry, the next launch must present the new token, not the rotated-away one (reuse).
  try {
    await tokenStore.setRefreshToken(tokens.refreshToken);
  } catch {
    warnNotSaved();
  }

  if (gen !== generation) {
    // Signed out while saving; its queued delete runs after this save, so storage ends empty.
    void revoke(tokens.refreshToken);
    return { kind: 'rejected' };
  }

  refreshToken = tokens.refreshToken;
  accessToken = tokens.accessToken;
  return { kind: 'ok', accessToken: tokens.accessToken };
}

/**
 * Runs once at launch, behind the splash: reads the stored refresh token, refreshes it once and
 * loads /users/me. Resolves with the user (null when signed out, or when the backend couldn't be
 * reached: then the session is kept and requests refresh when the network is back).
 */
export function restoreSession(): Promise<{ user: User | null }> {
  if (!restoring) {
    restoring = runRestore().finally(() => {
      restoring = undefined;
    });
  }
  return restoring;
}

async function runRestore(): Promise<{ user: User | null }> {
  let stored: string | null = null;
  try {
    stored = await tokenStore.getRefreshToken();
  } catch {
    stored = null; // unreadable secure storage: sign in again
  }
  if (!stored) {
    setState({ status: 'signedOut' });
    return { user: null };
  }

  refreshToken = stored;
  const outcome = await refreshSession();
  if (outcome.kind === 'rejected') {
    if (state.status !== 'signedOut') setState({ status: 'signedOut', endReason: 'expired' });
    return { user: null };
  }
  if (outcome.kind === 'unavailable') {
    setState({ status: 'signedIn' });
    return { user: null };
  }

  try {
    const user = await send<User>('GET', '/users/me', { accessToken: outcome.accessToken });
    setState({ status: 'signedIn' });
    return { user };
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) {
      await endSession('expired');
      return { user: null };
    }
    setState({ status: 'signedIn' });
    return { user: null };
  }
}

/** Test helper: back to a fresh launch. */
export function resetSessionForTests(): void {
  state = { status: 'restoring' };
  accessToken = undefined;
  refreshToken = undefined;
  generation = 0;
  refreshing = undefined;
  restoring = undefined;
  stateListeners.clear();
  endListeners.clear();
}
