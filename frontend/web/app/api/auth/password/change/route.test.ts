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
const CHANGE_URL = `${BACKEND_URL}/auth/password/change`;

function call(body: unknown = { currentPassword: "old-password", newPassword: "new-password" }) {
  return POST(
    new Request("http://web.test/api/auth/password/change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function callsTo(url: string) {
  return fetchMock.mock.calls
    .filter(([input]) => String(input) === url)
    .map(([, init]) => ({
      body: JSON.parse(String(init?.body)),
      auth: new Headers(init?.headers).get("authorization"),
    }));
}

function setCookies(res: Response): Record<string, string> {
  return Object.fromEntries(
    res.headers.getSetCookie().map((c) => {
      const [pair] = c.split(";");
      const [name, ...value] = pair.split("=");
      return [name, value.join("=")];
    }),
  );
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

describe("POST /api/auth/password/change", () => {
  it("forwards the passwords with this session's refresh token, so the backend keeps this session", async () => {
    fetchMock.mockResolvedValue(Response.json({ message: "Password changed." }));

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Password changed." });
    expect(callsTo(CHANGE_URL)).toEqual([
      {
        body: { currentPassword: "old-password", newPassword: "new-password", refreshToken: "refresh-1" },
        auth: "Bearer access-1",
      },
    ]);
    expect(setCookies(res)).toEqual({});
  });

  it("relays a wrong current password as a 400 with its field error, keeping the cookies", async () => {
    const errors = [{ path: "currentPassword", message: "The current password is incorrect." }];
    fetchMock.mockResolvedValue(Response.json({ message: "Validation failed", errors }, { status: 400 }));

    const res = await call();

    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual(errors);
    expect(setCookies(res)).toEqual({});
  });

  it("refreshes an expired access token, retries with the rotated pair and sets it", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `${BACKEND_URL}/auth/refresh`) {
        return Response.json({ accessToken: "access-2", refreshToken: "refresh-2" });
      }
      const auth = new Headers(init?.headers).get("authorization");
      if (auth === "Bearer access-2") return Response.json({ message: "Password changed." });
      return Response.json({ statusCode: 401, message: "Unauthorized" }, { status: 401 });
    });

    const res = await call();

    expect(res.status).toBe(200);
    expect(callsTo(CHANGE_URL).map((c) => [c.auth, c.body.refreshToken])).toEqual([
      ["Bearer access-1", "refresh-1"],
      ["Bearer access-2", "refresh-2"],
    ]);
    expect(setCookies(res)).toMatchObject({ [ACCESS_COOKIE]: "access-2", [REFRESH_COOKIE]: "refresh-2" });
  });

  it("ends the session when the refresh is rejected", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ statusCode: 401, message: "Invalid refresh token" }, { status: 401 }),
    );

    const res = await call();

    expect(res.status).toBe(401);
    expect(setCookies(res)).toEqual({ [ACCESS_COOKIE]: "", [REFRESH_COOKIE]: "", [SIGNED_IN_COOKIE]: "" });
  });

  it("refuses a body without both passwords before calling the backend", async () => {
    const res = await call({ newPassword: "new-password" });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
