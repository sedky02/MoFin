import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for SEC-01: two users refreshing at the same moment must each
// get their own token pair, never the other user's.

const jars = new AsyncLocalStorage<Map<string, string>>();
vi.mock("next/headers", () => ({
  cookies: async () => {
    const jar = jars.getStore();
    return {
      get: (name: string) => (jar?.has(name) ? { name, value: jar.get(name) } : undefined),
    };
  },
}));

import { GET } from "./route";
import { ACCESS_COOKIE, BACKEND_URL, REFRESH_COOKIE } from "@/lib/auth-cookies";

const fetchMock = vi.fn<typeof fetch>();

function callAs(refreshToken: string) {
  const jar = new Map([
    [ACCESS_COOKIE, "expired-access"],
    [REFRESH_COOKIE, refreshToken],
  ]);
  const req = new Request("http://web.test/api/backend/accounts");
  return jars.run(jar, () => GET(req, { params: Promise.resolve({ path: ["accounts"] }) }));
}

function cookieValue(res: Response, name: string): string | undefined {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return line?.split(";")[0].slice(name.length + 1);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("backend proxy refresh isolation between users", () => {
  it("gives each concurrently refreshing user their own new tokens", async () => {
    const id = crypto.randomUUID();
    const refreshA = `refresh-A-${id}`;
    const refreshB = `refresh-B-${id}`;

    const pending = new Map<string, (res: Response) => void>();
    const refreshRequests: string[] = [];
    const retryAuth: string[] = [];

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `${BACKEND_URL}/auth/refresh`) {
        const { refreshToken } = JSON.parse(String(init?.body)) as { refreshToken: string };
        refreshRequests.push(refreshToken);
        return new Promise<Response>((resolve) => pending.set(refreshToken, resolve));
      }
      const auth = new Headers(init?.headers).get("authorization");
      if (auth === "Bearer new-access-A" || auth === "Bearer new-access-B") {
        retryAuth.push(auth);
        return Response.json({ owner: auth.slice(-1) });
      }
      return Response.json({ statusCode: 401, message: "Unauthorized" }, { status: 401 });
    });

    const resA = callAs(refreshA);
    const resB = callAs(refreshB);

    // Both requests must reach the refresh endpoint before either is answered.
    await vi.waitFor(() => expect(pending.size).toBe(2));
    expect([...refreshRequests].sort()).toEqual([refreshA, refreshB].sort());

    // Answer out of order: B first, then A.
    pending.get(refreshB)!(Response.json({ accessToken: "new-access-B", refreshToken: "new-refresh-B" }));
    pending.get(refreshA)!(Response.json({ accessToken: "new-access-A", refreshToken: "new-refresh-A" }));

    const [a, b] = await Promise.all([resA, resB]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(cookieValue(a, ACCESS_COOKIE)).toBe("new-access-A");
    expect(cookieValue(a, REFRESH_COOKIE)).toBe("new-refresh-A");
    expect(cookieValue(b, ACCESS_COOKIE)).toBe("new-access-B");
    expect(cookieValue(b, REFRESH_COOKIE)).toBe("new-refresh-B");
    // Each retried upstream call carried its own user's new access token.
    expect(await a.json()).toEqual({ owner: "A" });
    expect(await b.json()).toEqual({ owner: "B" });
    expect([...retryAuth].sort()).toEqual(["Bearer new-access-A", "Bearer new-access-B"]);
  });
});
