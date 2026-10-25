import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api";
import { downloadFile, filenameFromDisposition } from "@/lib/download";

describe("filenameFromDisposition", () => {
  it("reads the quoted filename the export sends", () => {
    expect(filenameFromDisposition('attachment; filename="mofin-export-2026-10-25.csv"', "x")).toBe(
      "mofin-export-2026-10-25.csv",
    );
  });

  it("reads a bare filename", () => {
    expect(filenameFromDisposition("attachment; filename=data.json; size=3", "x")).toBe("data.json");
  });

  it("prefers the RFC 5987 form", () => {
    expect(
      filenameFromDisposition(`attachment; filename="fallback.csv"; filename*=UTF-8''d%C3%A9penses.csv`, "x"),
    ).toBe("dépenses.csv");
  });

  it("falls back without a header or a filename", () => {
    expect(filenameFromDisposition(null, "mofin-export.json")).toBe("mofin-export.json");
    expect(filenameFromDisposition("attachment", "mofin-export.json")).toBe("mofin-export.json");
    expect(filenameFromDisposition('attachment; filename=""', "mofin-export.json")).toBe("mofin-export.json");
  });

  it("strips path separators", () => {
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"', "x")).toBe(".._.._etc_passwd");
  });
});

describe("downloadFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws the server's status and message instead of saving an error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ statusCode: 429, message: "ThrottlerException: Too Many Requests" }, { status: 429 }),
      ),
    );

    const error = await downloadFile("/api/backend/export?format=csv", "mofin-export.csv").catch((e) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.status).toBe(429);
  });

  it("copes with an error that has no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad gateway", { status: 502, statusText: "Bad Gateway" })));

    const error = await downloadFile("/api/backend/export?format=json", "mofin-export.json").catch((e) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.status).toBe(502);
    expect(error.message).toBe("Bad Gateway");
  });
});
