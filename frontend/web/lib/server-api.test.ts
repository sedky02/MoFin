import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined = "tok";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));

import { serverGet, ServerPrefetchError } from "@/lib/server-api";

function respond(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return undefined;
}

beforeEach(() => {
  cookieValue = "tok";
});
afterEach(() => vi.unstubAllGlobals());

describe("serverGet failure kinds", () => {
  it("classifies a 401 as unauthorized when the caller opts in", async () => {
    vi.stubGlobal("fetch", respond(401));
    const err = await failure(serverGet("/users/me", undefined, { throwOnUnauthorized: true }));
    expect(err).toBeInstanceOf(ServerPrefetchError);
    expect((err as ServerPrefetchError).kind).toBe("unauthorized");
  });

  it("still returns null for a 401 by default, so other pages recover on the client", async () => {
    vi.stubGlobal("fetch", respond(401));
    await expect(serverGet("/transactions/1")).resolves.toBeNull();
  });

  it("returns null for another 4xx and with no access cookie", async () => {
    vi.stubGlobal("fetch", respond(404));
    await expect(serverGet("/x", undefined, { throwOnUnauthorized: true })).resolves.toBeNull();
    cookieValue = undefined;
    await expect(serverGet("/x", undefined, { throwOnUnauthorized: true })).resolves.toBeNull();
  });

  it("classifies a 503 as server", async () => {
    vi.stubGlobal("fetch", respond(503));
    const err = await failure(serverGet("/accounts"));
    expect((err as ServerPrefetchError).kind).toBe("server");
  });

  it("classifies an AbortSignal timeout as timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    const err = (await failure(serverGet("/accounts"))) as ServerPrefetchError;
    expect(err.kind).toBe("timeout");
    expect(err.timedOut).toBe(true);
  });

  it("classifies a network error as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const err = (await failure(serverGet("/accounts"))) as ServerPrefetchError;
    expect(err.kind).toBe("unreachable");
    expect(err.timedOut).toBe(false);
  });

  it("returns the JSON body on success", async () => {
    vi.stubGlobal("fetch", respond(200, { ok: 1 }));
    await expect(serverGet("/x")).resolves.toEqual({ ok: 1 });
  });
});
