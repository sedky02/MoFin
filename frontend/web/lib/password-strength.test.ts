import { describe, expect, it } from "vitest";
import { scorePassword } from "@/lib/password-strength";

const GOOD = 3;

describe("scorePassword", () => {
  it("keeps a short password below Good however varied it is", () => {
    expect(scorePassword("Ab1!")).toBeLessThan(GOOD);
    expect(scorePassword("Ab1!xY9")).toBeLessThan(GOOD);
    expect(scorePassword("")).toBe(0);
  });

  it("lets a password that meets the minimum length score", () => {
    expect(scorePassword("abcdefgh")).toBe(1);
    expect(scorePassword("Abcdef1!")).toBeGreaterThanOrEqual(GOOD);
    expect(scorePassword("Correct#Horse9Battery")).toBe(4);
  });
});
