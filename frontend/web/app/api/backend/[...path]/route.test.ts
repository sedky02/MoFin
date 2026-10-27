import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));

import { GET } from "./route";
import { ACCESS_COOKIE, BACKEND_URL, REFRESH_COOKIE, SIGNED_IN_COOKIE } from "@/lib/auth-cookies";
import { BFF_SECRET_HEADER, CLIENT_IP_HEADER } from "@/lib/bff-headers";

const fetchMock = vi.fn<typeof fetch>();

function call(path = ["accounts"]) {
  const req = new Request(`http://web.test/api/backend/${path.join("/")}`);
  return GET(req, { params: Promise.resolve({ path }) });
}

/** Answers backend calls: 401 for the data request, `refresh` for /auth/refresh. */
function backend(refresh: () => Response | Promise<Response>, retry?: () => Response) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === `${BACKEND_URL}/auth/refresh`) return refresh();
    const auth = new Headers(init?.headers).get("authorization");
    if (auth === "Bearer new-access" && retry) return retry();
    return Response.json({ statusCode: 401, message: "Unauthorized" }, { status: 401 });
  });
}

function setCookieNames(res: Response): string[] {
  return res.headers.getSetCookie().map((c) => c.split("=")[0]);
}

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(ACCESS_COOKIE, "old-access");
  // A distinct token per test so the module-level refresh lock never carries over.
  cookieJar.set(REFRESH_COOKIE, `refresh-${crypto.randomUUID()}`);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("backend proxy refresh handling", () => {
  it("keeps the cookies and answers 503 with Retry-After when the refresh is rate limited", async () => {
    backend(() =>
      Response.json(
        { statusCode: 429, message: "ThrottlerException: Too Many Requests" },
        { status: 429, headers: { "retry-after": "42" } },
      ),
    );

    const res = await call();

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(setCookieNames(res)).toEqual([]);
  });

  it.each([500, 502, 503])("keeps the cookies and answers 503 when the refresh returns %i", async (status) => {
    backend(() => new Response(null, { status }));

    const res = await call();

    expect(res.status).toBe(503);
    expect(setCookieNames(res)).toEqual([]);
  });

  it("keeps the cookies and answers 503 when the backend can't be reached", async () => {
    backend(() => {
      throw new TypeError("fetch failed");
    });

    const res = await call();

    expect(res.status).toBe(503);
    expect(setCookieNames(res)).toEqual([]);
  });

  it.each([401, 403])("clears the cookies and answers 401 when the refresh is rejected with %i", async (status) => {
    backend(() => Response.json({ statusCode: status, message: "Invalid refresh token" }, { status }));

    const res = await call();

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ message: "Session expired." });
    const cleared = res.headers.getSetCookie();
    expect(cleared.map((c) => c.split("=")[0]).sort()).toEqual([ACCESS_COOKIE, REFRESH_COOKIE, SIGNED_IN_COOKIE].sort());
    expect(cleared.every((c) => /Max-Age=0/i.test(c))).toBe(true);
  });

  it("retries with the new access token and rotates the cookies after a successful refresh", async () => {
    backend(
      () => Response.json({ accessToken: "new-access", refreshToken: "new-refresh" }),
      () => Response.json([{ id: "a1" }]),
    );

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "a1" }]);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${ACCESS_COOKIE}=new-access`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${REFRESH_COOKIE}=new-refresh`))).toBe(true);
  });
});

describe("backend proxy refresh lock", () => {
  const refreshCalls = () =>
    fetchMock.mock.calls.filter(([input]) => String(input) === `${BACKEND_URL}/auth/refresh`).length;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hands a late request still carrying the old refresh token the same new pair", async () => {
    backend(
      () => Response.json({ accessToken: "new-access", refreshToken: "new-refresh" }),
      () => Response.json([]),
    );

    const first = await call();
    const late = await call(); // same cookies: sent before the browser saw the rotation

    expect(refreshCalls()).toBe(1);
    for (const res of [first, late]) {
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie().some((c) => c.startsWith(`${REFRESH_COOKIE}=new-refresh`))).toBe(true);
    }
  });

  it("refreshes again once the reuse window has passed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    backend(
      () => Response.json({ accessToken: "new-access", refreshToken: "new-refresh" }),
      () => Response.json([]),
    );

    await call();
    vi.advanceTimersByTime(30_000);
    await call();

    expect(refreshCalls()).toBe(2);
  });

  it("doesn't hold on to a failed refresh, so the next 401 tries again", async () => {
    backend(() => new Response(null, { status: 429 }));

    await call();
    await call();

    expect(refreshCalls()).toBe(2);
  });
});

describe("backend proxy passthrough", () => {
  it("streams a download back with its type, filename and exact bytes", async () => {
    const csv = '﻿Date,Description\r\n2026-10-02,"Café, ""bio"""\r\n';
    fetchMock.mockResolvedValue(
      new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="mofin-export-2026-10-25.csv"',
          "x-internal": "not for the browser",
        },
      }),
    );

    const res = await call(["export"]);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="mofin-export-2026-10-25.csv"');
    expect(res.headers.get("x-internal")).toBeNull();
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe(csv);
  });

  it("keeps JSON responses as they were", async () => {
    fetchMock.mockResolvedValue(Response.json([{ id: "a1" }]));

    const res = await call();

    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(await res.json()).toEqual([{ id: "a1" }]);
  });

  it("answers a 204 with no body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const res = await call();

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });
});

describe("backend proxy client IP", () => {
  const SECRET = "s".repeat(40);

  beforeEach(() => {
    vi.stubEnv("BFF_SHARED_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function callFrom(ip: string) {
    const req = new Request("http://web.test/api/backend/accounts", { headers: { "x-forwarded-for": ip } });
    return GET(req, { params: Promise.resolve({ path: ["accounts"] }) });
  }

  it("sends the client IP and the shared secret to the backend", async () => {
    fetchMock.mockResolvedValue(Response.json([]));

    await callFrom("203.0.113.7");

    const sent = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(sent.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(sent.get(BFF_SECRET_HEADER)).toBe(SECRET);
  });

  it("sends them on the refresh and the retry too", async () => {
    backend(
      () => Response.json({ accessToken: "new-access", refreshToken: "new-refresh" }),
      () => Response.json([]),
    );

    await callFrom("203.0.113.7");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls) {
      const sent = new Headers(init?.headers);
      expect(sent.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
      expect(sent.get(BFF_SECRET_HEADER)).toBe(SECRET);
    }
  });
});
