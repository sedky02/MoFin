import { afterEach, describe, expect, it, vi } from "vitest";
import { BFF_SECRET_HEADER, CLIENT_IP_HEADER, bffHeaders, clientIp } from "./bff-headers";

const SECRET = "s".repeat(40);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("takes the first X-Forwarded-For entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
  });

  it("prefers X-Forwarded-For over X-Real-IP", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.1" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it.each([
    ["no headers", {}],
    ["an empty X-Forwarded-For", { "x-forwarded-for": "" }],
    ["a blank X-Real-IP", { "x-real-ip": "  " }],
  ])("is undefined with %s", (_label, init) => {
    expect(clientIp(new Headers(init))).toBeUndefined();
  });
});

describe("bffHeaders", () => {
  it("sends the secret and the client IP from a request", () => {
    vi.stubEnv("BFF_SHARED_SECRET", SECRET);
    const req = new Request("http://web.test/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(bffHeaders(req)).toEqual({
      [BFF_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: "203.0.113.7",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });
  });

  it("accepts the incoming headers of a Server Component", () => {
    vi.stubEnv("BFF_SHARED_SECRET", SECRET);
    expect(bffHeaders(new Headers({ "x-real-ip": "198.51.100.1" }))).toEqual({
      [BFF_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: "198.51.100.1",
    });
  });

  it("sends only the secret without an incoming request", () => {
    vi.stubEnv("BFF_SHARED_SECRET", SECRET);
    expect(bffHeaders()).toEqual({ [BFF_SECRET_HEADER]: SECRET });
  });

  it("leaves the secret out when none is configured", () => {
    vi.stubEnv("BFF_SHARED_SECRET", "");
    const req = new Request("http://web.test/", { headers: { "x-forwarded-for": "203.0.113.7" } });
    expect(bffHeaders(req)).toEqual({ [CLIENT_IP_HEADER]: "203.0.113.7", "x-forwarded-for": "203.0.113.7" });
  });

  it("leaves the client IP out when the request has none", () => {
    vi.stubEnv("BFF_SHARED_SECRET", SECRET);
    expect(bffHeaders(new Request("http://web.test/"))).toEqual({ [BFF_SECRET_HEADER]: SECRET });
  });
});
