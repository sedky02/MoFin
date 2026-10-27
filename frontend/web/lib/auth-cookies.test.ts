import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  SIGNED_IN_COOKIE,
  clearAuthCookies,
  secureCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("secureCookies", () => {
  it("is on in production and off otherwise by default", () => {
    vi.stubEnv("COOKIE_SECURE", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(secureCookies()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(secureCookies()).toBe(false);
  });

  it("can be turned off in production for a plain-http local demo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    expect(secureCookies()).toBe(false);
  });

  it("can be forced on outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COOKIE_SECURE", "TRUE");
    expect(secureCookies()).toBe(true);
  });

  it("ignores values other than true/false", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "no");
    expect(secureCookies()).toBe(true);
  });
});

describe("setAuthCookies", () => {
  it("drops the Secure flag when COOKIE_SECURE=false in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    const res = NextResponse.json({});
    setAuthCookies(res, { accessToken: "a", refreshToken: "r" });
    expect(res.cookies.get(ACCESS_COOKIE)?.secure).toBe(false);
    expect(res.cookies.get(REFRESH_COOKIE)?.secure).toBe(false);
  });

  it("keeps the Secure flag in production by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "");
    const res = NextResponse.json({});
    setAuthCookies(res, { accessToken: "a", refreshToken: "r" });
    expect(res.cookies.get(ACCESS_COOKIE)?.secure).toBe(true);
    expect(res.cookies.get(REFRESH_COOKIE)?.secure).toBe(true);
  });
});

describe("signed-in hint", () => {
  it("is set with the session, readable by page scripts, and carries no token", () => {
    const res = NextResponse.json({});
    setAuthCookies(res, { accessToken: "a", refreshToken: "r" });
    const hint = res.cookies.get(SIGNED_IN_COOKIE);
    expect(hint?.value).toBe("1");
    expect(hint?.httpOnly).toBe(false);
    expect(res.cookies.get(ACCESS_COOKIE)?.httpOnly).toBe(true);
    expect(res.cookies.get(REFRESH_COOKIE)?.httpOnly).toBe(true);
  });

  it("is cleared with the session", () => {
    const res = NextResponse.json({});
    clearAuthCookies(res);
    expect(res.cookies.get(SIGNED_IN_COOKIE)).toMatchObject({ value: "", maxAge: 0 });
  });
});
