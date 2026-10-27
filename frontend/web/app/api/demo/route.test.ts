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

const call = (origin: string | null = "http://web.test") =>
  POST(
    new Request("http://web.test/api/demo", {
      method: "POST",
      headers: origin ? { origin } : {},
    }),
  );

const tokens = { accessToken: "access-demo", refreshToken: "refresh-demo", expiresAt: "x", reused: false };

function setCookieNames(res: Response): string[] {
  return res.headers.getSetCookie().map((c) => c.split("=")[0]);
}

beforeEach(() => {
  cookieJar.clear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("POST /api/demo", () => {
  it("starts a demo, sets the session cookies and goes to the dashboard", async () => {
    fetchMock.mockResolvedValue(Response.json(tokens));

    const res = await call();

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://web.test/dashboard");
    expect(setCookieNames(res).sort()).toEqual([ACCESS_COOKIE, REFRESH_COOKIE, SIGNED_IN_COOKIE].sort());
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(`${BACKEND_URL}/auth/demo`);
    expect(JSON.parse(String(init?.body))).toEqual({});
  });

  it("sends the visitor's refresh token so an existing demo carries on", async () => {
    cookieJar.set(REFRESH_COOKIE, "refresh-1");
    fetchMock.mockResolvedValue(Response.json({ ...tokens, reused: true }));

    await call();

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ refreshToken: "refresh-1" });
  });

  it("keeps a real account's session: no cookies, straight to the dashboard", async () => {
    cookieJar.set(REFRESH_COOKIE, "refresh-real");
    fetchMock.mockResolvedValue(Response.json({ code: "SIGNED_IN" }, { status: 409 }));

    const res = await call();

    expect(res.headers.get("location")).toBe("http://web.test/dashboard");
    expect(setCookieNames(res)).toEqual([]);
  });

  it.each([
    [429, {}, "limited"],
    [503, { code: "DEMO_BUSY" }, "busy"],
    [503, { code: "DEMO_DISABLED" }, "off"],
    [500, {}, "failed"],
  ])("goes back to the landing page with a reason on %i %j", async (status, body, notice) => {
    fetchMock.mockResolvedValue(Response.json(body, { status }));

    const res = await call();

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`http://web.test/?demo=${notice}`);
    expect(setCookieNames(res)).toEqual([]);
  });

  it("goes back with a reason when the backend can't be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const res = await call();

    expect(res.headers.get("location")).toBe("http://web.test/?demo=failed");
  });

  it("refuses posts from other sites without calling the backend", async () => {
    const res = await call("https://evil.example");

    expect(res.headers.get("location")).toBe("http://web.test/?demo=failed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setCookieNames(res)).toEqual([]);
  });
});
