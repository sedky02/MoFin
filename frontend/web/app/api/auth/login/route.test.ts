import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { BACKEND_URL } from "@/lib/auth-cookies";
import { BFF_SECRET_HEADER, CLIENT_IP_HEADER } from "@/lib/bff-headers";

const SECRET = "s".repeat(40);
const fetchMock = vi.fn<typeof fetch>();

function login(headers: Record<string, string> = {}) {
  return POST(
    new Request("http://web.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email: "a@example.com", password: "whatever" }),
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("BFF_SHARED_SECRET", SECRET);
  fetchMock.mockResolvedValue(Response.json({ accessToken: "a", refreshToken: "r" }, { status: 201 }));
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/login", () => {
  it("sends the client IP and the shared secret to the backend", async () => {
    const res = await login({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });

    expect(res.status).toBe(200);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(`${BACKEND_URL}/auth/login`);
    const sent = new Headers(init?.headers);
    expect(sent.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(sent.get(BFF_SECRET_HEADER)).toBe(SECRET);
  });

  it("takes the client IP from X-Real-IP when there is no X-Forwarded-For", async () => {
    await login({ "x-real-ip": "198.51.100.1" });

    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get(CLIENT_IP_HEADER)).toBe("198.51.100.1");
  });

  it("never returns the secret to the browser", async () => {
    const res = await login({ "x-forwarded-for": "203.0.113.7" });

    expect(JSON.stringify([...res.headers])).not.toContain(SECRET);
    expect(await res.text()).not.toContain(SECRET);
  });
});
