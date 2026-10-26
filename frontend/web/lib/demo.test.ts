import { describe, expect, it } from "vitest";
import { parseDemoNotice, timeLeft } from "./demo";

describe("demo helpers", () => {
  it("reads only the reasons the landing page knows", () => {
    expect(parseDemoNotice("busy")).toBe("busy");
    expect(parseDemoNotice("anything")).toBeNull();
    expect(parseDemoNotice(["busy"])).toBeNull();
    expect(parseDemoNotice(undefined)).toBeNull();
  });

  it("says how long a demo has left, in hours then minutes", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    expect(timeLeft("2026-10-27T11:30:00Z", now)).toBe("23 h");
    expect(timeLeft("2026-10-26T12:40:00Z", now)).toBe("40 min");
    expect(timeLeft("2026-10-26T11:59:00Z", now)).toBeNull();
  });
});
