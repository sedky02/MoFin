import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_INVITE_KEY } from "@/lib/account-sharing";
import {
  afterVerificationHref,
  checkEmailUrl,
  forgetContinuation,
  rememberContinuation,
} from "@/lib/pending-signup";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("checkEmailUrl", () => {
  it("carries the MCP bridge and next params, nothing else", () => {
    const url = checkEmailUrl("a@b.com", "signup", new URLSearchParams("next=/goals&mcp_authorize=x&utm=y"));
    const params = new URLSearchParams(url.split("?")[1]);

    expect(url.startsWith("/check-email?")).toBe(true);
    expect(Object.fromEntries(params)).toEqual({
      email: "a@b.com",
      reason: "signup",
      next: "/goals",
      mcp_authorize: "x",
    });
  });
});

describe("afterVerificationHref", () => {
  it("resumes the MCP bridge first", () => {
    rememberContinuation(new URLSearchParams("mcp_authorize=https://x/authorize&next=/goals"));
    expect(afterVerificationHref()).toBe(`/api/auth/mcp-handoff?continue=${encodeURIComponent("https://x/authorize")}`);
  });

  it("goes back to a pending invitation, then to a safe next path", () => {
    localStorage.setItem(PENDING_INVITE_KEY, "token");
    expect(afterVerificationHref()).toBe("/invitations/accept");

    localStorage.removeItem(PENDING_INVITE_KEY);
    rememberContinuation(new URLSearchParams("next=/goals"));
    expect(afterVerificationHref()).toBe("/goals");
  });

  it("never follows an off-site next and defaults to the dashboard", () => {
    rememberContinuation(new URLSearchParams("next=https://evil.example"));
    expect(afterVerificationHref()).toBe("/dashboard");

    forgetContinuation();
    expect(afterVerificationHref()).toBe("/dashboard");
  });
});
