import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));

import { POST } from "./route";
import { ACCESS_COOKIE, BACKEND_URL, REFRESH_COOKIE, SIGNED_IN_COOKIE } from "@/lib/auth-cookies";

const fetchMock = vi.fn<typeof fetch>();

const call = () => POST(new Request("http://web.test/api/auth/sessions/revoke-all", { method: "POST" }));

function setCookieNames(res: Response): string[] {
  return res.headers.getSetCookie().map((c) => c.split("=")[0]);
}

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(ACCESS_COOKIE, "access-1");
  cookieJar.set(REFRESH_COOKIE, "refresh-1");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("POST /api/auth/sessions/revoke-all", () => {
  it("revokes as this session, then clears this browser's cookies", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const res = await call();

    expect(res.status).toBe(204);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(`${BACKEND_URL}/auth/sessions/revoke-all`);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-1");
    expect(res.headers.getSetCookie().every((c) => /Max-Age=0/i.test(c))).toBe(true);
    expect(setCookieNames(res).sort()).toEqual([ACCESS_COOKIE, REFRESH_COOKIE, SIGNED_IN_COOKIE].sort());
  });

  it("keeps the cookies when the backend fails, so the user can try again", async () => {
    fetchMock.mockResolvedValue(Response.json({ statusCode: 500, message: "boom" }, { status: 500 }));

    const res = await call();

    expect(res.status).toBe(500);
    expect(setCookieNames(res)).toEqual([]);
  });

  it("answers 504 and keeps the cookies when the backend can't be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const res = await call();

    expect(res.status).toBe(504);
    expect(setCookieNames(res)).toEqual([]);
  });
});
