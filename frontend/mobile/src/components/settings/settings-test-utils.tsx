// Test helpers for the Settings tests (imported by *.test.tsx only): a recorded fetch double, a
// signed-in session, and a render inside the app's own query client (the one sign-out clears).
import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as React from 'react';

import { startSession } from '@/api/session';
import { userKeys } from '@/core/query-keys';
import type { User } from '@/core/types';
import { installSessionEffects } from '@/lib/app-boot';
import { getQueryClient } from '@/lib/query-client';
import { resetToasts } from '@/lib/toast';

export const API = 'https://api.test/api/v1';
export const REFRESH_KEY = 'mofin.refreshToken';
export const secure = SecureStore as unknown as { __store: Map<string, string> };

export type Call = { path: string; method: string; auth?: string; body?: unknown };

export function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Replaces fetch; every call is recorded (path without the API base) and answered by `responder`. */
export function mockFetch(responder: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      path: String(input).replace(API, ''),
      method: init?.method ?? 'GET',
      auth: headers.Authorization,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return responder(call);
  }) as unknown as typeof fetch;
  return calls;
}

export const baseUser = (over: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'alex@example.com',
  displayName: 'Alex',
  hasPassword: true,
  isDemo: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

/**
 * Signed in with a known token pair, an empty cache and no toasts. The app's session effects (the
 * cache clear on sign-out) stay installed: resetSessionForTests would drop them for good.
 */
export async function signedIn(): Promise<void> {
  resetToasts();
  secure.__store.clear();
  installSessionEffects();
  const client = getQueryClient();
  client.clear();
  // A sign-out clears the cache while the screen is still mounted; each dropped query would then
  // start a 5-minute gc timer that keeps Jest alive (mutations too), so: no timer, infinite gcTime.
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, gcTime: Infinity },
    mutations: { ...defaults.mutations, gcTime: Infinity },
  });
  await startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
}

/** Renders `ui` in the app's query client with `user` already loaded (as after launch). */
export async function renderWithUser(ui: React.ReactElement, user: User = baseUser()) {
  const client = getQueryClient();
  client.setQueryData(userKeys.me, user);
  return render(
    <QueryClientProvider client={client}>
      {ui}
      <PortalHost />
    </QueryClientProvider>,
  );
}
