import * as SecureStore from 'expo-secure-store';

import { api, ApiClientError, authApi } from '@/api/client';
import {
  getAccessToken,
  getSessionState,
  hasSession,
  onSessionEnd,
  resetSessionForTests,
  restoreSession,
  signOut,
  startSession,
} from '@/api/session';

// The in-memory SecureStore from jest.setup.js.
const secure = SecureStore as unknown as {
  __store: Map<string, string>;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};
const KEY = 'mofin.refreshToken';
const API = 'https://api.test/api/v1';

type Call = { url: string; method: string; auth?: string; body?: unknown };
type Responder = (call: Call) => Response | Promise<Response>;

let calls: Call[];
let events: string[];

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** fetch double: records every call (and the order of fetch vs SecureStore writes) and answers with `responder`. */
function mockFetch(responder: Responder) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      auth: headers.Authorization,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    events.push(`fetch ${call.method} ${call.url.replace(API, '')} ${call.auth ?? ''}`.trim());
    return responder(call);
  }) as unknown as typeof fetch;
}

/** A promise you resolve from the test, to hold a response back. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const refreshCalls = () => calls.filter((c) => c.url.endsWith('/auth/refresh'));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  resetSessionForTests();
  secure.__store.clear();
  calls = [];
  events = [];
  secure.setItemAsync.mockClear();
  secure.deleteItemAsync.mockClear();
  // A write that takes real time (like the Keychain), recorded when it completes, so a retry that
  // doesn't wait for it shows up before it in `events`.
  secure.setItemAsync.mockImplementation(async (k: string, v: string) => {
    await new Promise((r) => setTimeout(r, 5));
    secure.__store.set(k, v);
    events.push(`persist ${v}`);
  });
});

describe('request basics', () => {
  it('sends the bearer token, a request id and JSON, and returns the parsed body', async () => {
    await startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    mockFetch(() => json(200, { ok: true }));
    await expect(api.post('/accounts', { name: 'Cash' })).resolves.toEqual({ ok: true });
    const [call] = calls;
    expect(call.url).toBe(`${API}/accounts`);
    expect(call.auth).toBe('Bearer access-1');
    expect(call.body).toEqual({ name: 'Cash' });
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('builds the query string and skips empty params', async () => {
    await startSession({ accessToken: 'a', refreshToken: 'r' });
    mockFetch(() => json(200, []));
    await api.get('/transactions', { page: 2, q: 'rent & bills', accountId: undefined, x: null, y: '' });
    expect(calls[0].url).toBe(`${API}/transactions?page=2&q=rent%20%26%20bills`);
  });

  it('resolves undefined on 204', async () => {
    await startSession({ accessToken: 'a', refreshToken: 'r' });
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(api.delete('/accounts/1')).resolves.toBeUndefined();
  });

  it('throws ApiClientError with status, body and validation like the web', async () => {
    await startSession({ accessToken: 'a', refreshToken: 'r' });
    const body = { message: 'Validation failed', errors: [{ path: 'name', message: 'Required' }] };
    mockFetch(() => json(400, body));
    const err = (await api.post('/accounts', {}).catch((e) => e)) as ApiClientError;
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Validation failed');
    expect(err.body).toEqual(body);
    expect(err.validation).toEqual(body.errors);
  });
});

describe('single-flight refresh', () => {
  it('five parallel 401s trigger exactly one refresh, then each request retries once', async () => {
    await startSession({ accessToken: 'old-access', refreshToken: 'refresh-1' });
    const gate = deferred<void>();
    mockFetch(async (call) => {
      if (call.url.endsWith('/auth/refresh')) {
        await gate.promise;
        return json(201, { accessToken: 'new-access', refreshToken: 'refresh-2' });
      }
      return call.auth === 'Bearer new-access' ? json(200, { path: call.url }) : json(401, { message: 'Unauthorized' });
    });

    const results = Promise.all([1, 2, 3, 4, 5].map((i) => api.get(`/items/${i}`)));
    await flush();
    gate.resolve();
    await expect(results).resolves.toHaveLength(5);

    expect(refreshCalls()).toHaveLength(1);
    expect(refreshCalls()[0].body).toEqual({ refreshToken: 'refresh-1' });
    // 5 first tries + 1 refresh + 5 retries.
    expect(calls).toHaveLength(11);
    expect(calls.filter((c) => c.auth === 'Bearer new-access')).toHaveLength(5);
    expect(getAccessToken()).toBe('new-access');
  });

  it('a 401 that arrives after the refresh finished reuses the new token without refreshing again', async () => {
    await startSession({ accessToken: 'old-access', refreshToken: 'refresh-1' });
    const late = deferred<Response>();
    mockFetch((call) => {
      if (call.url.endsWith('/auth/refresh')) return json(201, { accessToken: 'new-access', refreshToken: 'refresh-2' });
      if (call.url.endsWith('/late') && call.auth === 'Bearer old-access') return late.promise;
      return call.auth === 'Bearer new-access' ? json(200, {}) : json(401, {});
    });

    const lateReq = api.get('/late');
    await api.get('/early'); // 401 -> refresh -> retry
    late.resolve(json(401, {}));
    await lateReq;
    expect(refreshCalls()).toHaveLength(1);
  });

  it('persists the rotated refresh token before any retry is sent', async () => {
    await startSession({ accessToken: 'old-access', refreshToken: 'refresh-1' });
    events = [];
    mockFetch((call) => {
      if (call.url.endsWith('/auth/refresh')) return json(201, { accessToken: 'new-access', refreshToken: 'refresh-2' });
      return call.auth === 'Bearer new-access' ? json(200, {}) : json(401, {});
    });
    await Promise.all([api.get('/a'), api.get('/b')]);

    const persisted = events.indexOf('persist refresh-2');
    const firstRetry = events.findIndex((e) => e.endsWith('Bearer new-access'));
    expect(persisted).toBeGreaterThan(-1);
    expect(firstRetry).toBeGreaterThan(persisted);
    expect(secure.__store.get(KEY)).toBe('refresh-2');
  });

  it('a second 401 on the retry is returned to the caller, with no second refresh', async () => {
    await startSession({ accessToken: 'old-access', refreshToken: 'refresh-1' });
    mockFetch((call) =>
      call.url.endsWith('/auth/refresh')
        ? json(201, { accessToken: 'new-access', refreshToken: 'refresh-2' })
        : json(401, { message: 'Nope' }),
    );
    const err = (await api.get('/a').catch((e) => e)) as ApiClientError;
    expect(err.status).toBe(401);
    expect(refreshCalls()).toHaveLength(1);
    expect(getSessionState().status).toBe('signedIn');
  });
});

describe('when the refresh is refused', () => {
  it.each([
    ['rejected (401)', 401, { message: 'Invalid refresh token' }],
    ['reuse detected', 401, { message: 'Refresh token reuse detected' }],
    ['malformed (400)', 400, { message: 'Validation failed', errors: [] }],
  ])('%s: clears the stored token, memory and caches, and signs out', async (_label, status, body) => {
    await startSession({ accessToken: 'old-access', refreshToken: 'refresh-1' });
    const ended = jest.fn();
    onSessionEnd(ended);
    mockFetch((call) => (call.url.endsWith('/auth/refresh') ? json(status, body) : json(401, {})));

    const results = await Promise.allSettled([api.get('/a'), api.get('/b'), api.get('/c')]);
    for (const r of results) {
      expect(r.status).toBe('rejected');
      expect(((r as PromiseRejectedResult).reason as ApiClientError).status).toBe(401);
    }
    expect(refreshCalls()).toHaveLength(1);
    expect(secure.__store.has(KEY)).toBe(false);
    expect(getAccessToken()).toBeUndefined();
    expect(hasSession()).toBe(false);
    expect(getSessionState()).toEqual({ status: 'signedOut', endReason: 'expired' });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith('expired');
  });

  it('keeps the session when the backend is unavailable (5xx / 429 / offline)', async () => {
    await startSession({ accessToken: 'old-access', refreshToken: 'refresh-1' });
    mockFetch((call) => (call.url.endsWith('/auth/refresh') ? json(503, { message: 'down' }) : json(401, {})));
    const err = (await api.get('/a').catch((e) => e)) as ApiClientError;
    expect(err.status).toBe(503);
    expect(getSessionState().status).toBe('signedIn');
    expect(secure.__store.get(KEY)).toBe('refresh-1');

    mockFetch(() => Promise.reject(new TypeError('Network request failed')));
    await expect(api.get('/a')).rejects.toThrow('Network request failed');
    expect(hasSession()).toBe(true);
  });
});

describe('sign-out', () => {
  it('posts logout with the refresh token, then clears everything', async () => {
    await startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const ended = jest.fn();
    onSessionEnd(ended);
    mockFetch(() => new Response(null, { status: 201 }));
    await signOut();

    expect(calls).toEqual([expect.objectContaining({ url: `${API}/auth/logout`, method: 'POST', body: { refreshToken: 'refresh-1' } })]);
    expect(secure.__store.has(KEY)).toBe(false);
    expect(getAccessToken()).toBeUndefined();
    expect(getSessionState()).toEqual({ status: 'signedOut', endReason: 'signed_out' });
    expect(ended).toHaveBeenCalledWith('signed_out');
  });

  it('still signs out locally when the logout call fails', async () => {
    await startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    mockFetch(() => Promise.reject(new TypeError('Network request failed')));
    await expect(signOut()).resolves.toBeUndefined();
    expect(secure.__store.has(KEY)).toBe(false);
    expect(getSessionState().status).toBe('signedOut');
  });

  it('a request after sign-out does not refresh or resurrect the session', async () => {
    await startSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    mockFetch((call) => (call.url.endsWith('/auth/logout') ? new Response(null, { status: 201 }) : json(401, {})));
    await signOut();
    calls = [];

    const err = (await api.get('/accounts').catch((e) => e)) as ApiClientError;
    expect(err.status).toBe(401);
    expect(refreshCalls()).toHaveLength(0);
    expect(calls[0].auth).toBeUndefined();
    expect(getSessionState().status).toBe('signedOut');
    expect(secure.__store.has(KEY)).toBe(false);
  });

  it('a refresh in flight during sign-out is discarded and revoked, not saved', async () => {
    await startSession({ accessToken: 'old-access', refreshToken: 'refresh-1' });
    const gate = deferred<void>();
    mockFetch(async (call) => {
      if (call.url.endsWith('/auth/refresh')) {
        await gate.promise;
        return json(201, { accessToken: 'new-access', refreshToken: 'refresh-2' });
      }
      if (call.url.endsWith('/auth/logout')) return new Response(null, { status: 201 });
      return json(401, {});
    });

    const pending = api.get('/a').catch((e) => e);
    await flush();
    await signOut();
    gate.resolve();
    const err = (await pending) as ApiClientError;
    await flush();

    expect(err.status).toBe(401);
    expect(getAccessToken()).toBeUndefined();
    expect(secure.__store.has(KEY)).toBe(false);
    expect(getSessionState().status).toBe('signedOut');
    // Both the old and the late rotated token were sent to logout.
    const revoked = calls.filter((c) => c.url.endsWith('/auth/logout')).map((c) => (c.body as { refreshToken: string }).refreshToken);
    expect(revoked).toEqual(expect.arrayContaining(['refresh-1', 'refresh-2']));
  });
});

describe('restoreSession', () => {
  const user = { id: 'u1', email: 'a@b.c', displayName: 'Alex', createdAt: '', updatedAt: '' };

  it('signed out when nothing is stored, without any request', async () => {
    mockFetch(() => json(500, {}));
    await expect(restoreSession()).resolves.toEqual({ user: null });
    expect(calls).toHaveLength(0);
    expect(getSessionState()).toEqual({ status: 'signedOut' });
  });

  it('refreshes once, saves the rotated token and loads /users/me', async () => {
    secure.__store.set(KEY, 'stored-refresh');
    mockFetch((call) => {
      if (call.url.endsWith('/auth/refresh')) return json(201, { accessToken: 'new-access', refreshToken: 'refresh-2' });
      if (call.url.endsWith('/users/me') && call.auth === 'Bearer new-access') return json(200, user);
      return json(401, {});
    });
    await expect(restoreSession()).resolves.toEqual({ user });
    expect(refreshCalls()).toHaveLength(1);
    expect(refreshCalls()[0].body).toEqual({ refreshToken: 'stored-refresh' });
    expect(secure.__store.get(KEY)).toBe('refresh-2');
    expect(getSessionState().status).toBe('signedIn');
  });

  it('signs out (session expired) when the stored token is refused', async () => {
    secure.__store.set(KEY, 'stored-refresh');
    mockFetch(() => json(401, { message: 'Refresh token expired' }));
    await expect(restoreSession()).resolves.toEqual({ user: null });
    expect(secure.__store.has(KEY)).toBe(false);
    expect(getSessionState()).toEqual({ status: 'signedOut', endReason: 'expired' });
  });

  it('stays signed in when offline at launch, and refreshes on the next request', async () => {
    secure.__store.set(KEY, 'stored-refresh');
    mockFetch(() => Promise.reject(new TypeError('Network request failed')));
    await expect(restoreSession()).resolves.toEqual({ user: null });
    expect(getSessionState().status).toBe('signedIn');
    expect(secure.__store.get(KEY)).toBe('stored-refresh');

    calls = [];
    mockFetch((call) => {
      if (call.url.endsWith('/auth/refresh')) return json(201, { accessToken: 'new-access', refreshToken: 'refresh-2' });
      return call.auth === 'Bearer new-access' ? json(200, user) : json(401, {});
    });
    await expect(api.get('/users/me')).resolves.toEqual(user);
    expect(refreshCalls()).toHaveLength(1);
    expect(calls).toHaveLength(2); // refresh first, then one request with the new token
  });

  it('keeps the session but returns no user when /users/me fails with a 5xx', async () => {
    secure.__store.set(KEY, 'stored-refresh');
    mockFetch((call) =>
      call.url.endsWith('/auth/refresh') ? json(201, { accessToken: 'a2', refreshToken: 'r2' }) : json(500, {}),
    );
    await expect(restoreSession()).resolves.toEqual({ user: null });
    expect(getSessionState().status).toBe('signedIn');
  });
});

describe('authApi', () => {
  it('login, then startSession saves only the refresh token', async () => {
    mockFetch(() => json(201, { accessToken: 'access-1', refreshToken: 'refresh-1' }));
    const tokens = await authApi.login({ email: 'a@b.c', password: 'pw' });
    expect(calls[0].auth).toBeUndefined();
    await startSession(tokens);
    expect([...secure.__store.entries()]).toEqual([[KEY, 'refresh-1']]);
    expect(getSessionState().status).toBe('signedIn');
  });

  it('google id-token posts the token to the new route', async () => {
    mockFetch(() => json(201, { accessToken: 'a', refreshToken: 'r' }));
    await authApi.googleIdToken('google-id-token');
    expect(calls[0]).toMatchObject({ url: `${API}/auth/google/id-token`, method: 'POST', body: { idToken: 'google-id-token' } });
  });

  it('times out as a 504 the forms already know how to explain', async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          }),
      ) as unknown as typeof fetch;
      const pending = authApi.login({ email: 'a@b.c', password: 'pw' }).catch((e) => e);
      jest.advanceTimersByTime(15_001);
      const err = (await pending) as ApiClientError;
      expect(err.status).toBe(504);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('tokens stay out of logs', () => {
  it('no console output contains a token across sign-in, refresh, refusal and sign-out', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    );
    try {
      // A failing SecureStore write makes the client warn: that warning must not carry the token.
      secure.setItemAsync.mockImplementationOnce(async () => {
        throw new Error('keychain unavailable');
      });
      await startSession({ accessToken: 'SECRET-ACCESS-1', refreshToken: 'SECRET-REFRESH-1' });
      mockFetch((call) => {
        if (call.url.endsWith('/auth/refresh')) return json(201, { accessToken: 'SECRET-ACCESS-2', refreshToken: 'SECRET-REFRESH-2' });
        return call.auth === 'Bearer SECRET-ACCESS-2' ? json(500, { message: 'boom' }) : json(401, {});
      });
      const err = (await api.get('/a').catch((e) => e)) as ApiClientError;
      expect(err.message).not.toMatch(/SECRET/);

      mockFetch(() => json(401, { message: 'Refresh token reuse detected' }));
      await startSession({ accessToken: 'SECRET-ACCESS-3', refreshToken: 'SECRET-REFRESH-3' });
      const refused = (await api.get('/b').catch((e) => e)) as ApiClientError;
      expect(refused.message).not.toMatch(/SECRET/);
      expect(JSON.stringify(refused.body)).not.toMatch(/SECRET/);

      await signOut();

      const logged = spies.flatMap((s) => s.mock.calls).map((args) => args.map(String).join(' ')).join('\n');
      expect(spies.some((s) => s.mock.calls.length > 0)).toBe(true); // the storage warning was logged
      expect(logged).not.toMatch(/SECRET/);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
