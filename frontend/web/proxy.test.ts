import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import proxy from "./proxy";
import { REFRESH_COOKIE } from "@/lib/auth-cookies";

function visit(path: string, signedIn: boolean) {
  const req = new NextRequest(new URL(path, "http://web.test"));
  if (signedIn) req.cookies.set(REFRESH_COOKIE, "refresh-1");
  return proxy(req);
}

describe("proxy", () => {
  it("shows visitors the landing page at /", () => {
    const res = visit("/", false);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("sends signed-in users from / to their dashboard", () => {
    expect(visit("/", true).headers.get("location")).toBe("http://web.test/dashboard");
  });

  it("still sends visitors from app routes to sign in", () => {
    expect(visit("/dashboard", false).headers.get("location")).toMatch(/^http:\/\/web\.test\/login/);
  });
});
