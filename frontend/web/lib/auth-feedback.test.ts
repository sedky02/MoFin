import { describe, expect, it } from "vitest";
import { loginErrorUrl, loginNotice } from "@/lib/auth-feedback";

const notice = (qs: string) => loginNotice(new URLSearchParams(qs));

describe("loginNotice", () => {
  it("explains a failed Google sign-in", () => {
    expect(notice("error=google_failed")).toEqual({
      kind: "error",
      message: "Google sign-in didn't finish — try again or use email.",
    });
  });

  it("explains Google sign-in being unavailable", () => {
    expect(notice("error=google_unconfigured")?.message).toMatch(/isn't available/);
  });

  it("explains an expired session", () => {
    expect(notice("reason=expired")).toEqual({
      kind: "info",
      message: "Your session expired. Sign in to continue.",
    });
  });

  it("confirms signing out everywhere", () => {
    expect(notice("reason=signed_out")).toEqual({
      kind: "info",
      message: "You've been signed out on every device. Sign in to continue.",
    });
  });

  it("confirms a deleted account", () => {
    expect(notice("reason=account_deleted")).toEqual({
      kind: "info",
      message: "Your account and its data were deleted.",
    });
  });

  it("gives an unknown error code a generic message, never the raw value", () => {
    const n = notice("error=%3Cb%3Ehacked%3C%2Fb%3E");
    expect(n).toEqual({ kind: "error", message: "Sign-in didn't finish. Please try again." });
    expect(notice("error=toString")?.message).toBe("Sign-in didn't finish. Please try again.");
  });

  it("ignores unknown reasons and plain visits", () => {
    expect(notice("reason=whatever")).toBeNull();
    expect(notice("reason=constructor")).toBeNull();
    expect(notice("")).toBeNull();
    expect(notice("next=%2Fgoals")).toBeNull();
  });

  it("prefers the error over the reason", () => {
    expect(notice("reason=expired&error=google_failed")?.kind).toBe("error");
  });
});

describe("loginErrorUrl", () => {
  it("carries the code", () => {
    expect(loginErrorUrl("google_failed")).toBe("/login?error=google_failed");
  });

  it("keeps a safe return path", () => {
    expect(loginErrorUrl("google_failed", "/transactions/new")).toBe(
      "/login?error=google_failed&next=%2Ftransactions%2Fnew",
    );
  });

  it("drops an unsafe or default return path", () => {
    expect(loginErrorUrl("google_unconfigured", "https://evil.example")).toBe("/login?error=google_unconfigured");
    expect(loginErrorUrl("google_failed", "/dashboard")).toBe("/login?error=google_failed");
  });
});
