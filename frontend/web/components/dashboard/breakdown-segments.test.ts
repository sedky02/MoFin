import { describe, expect, it } from "vitest";
import { breakdownSegments } from "./breakdown-segments";

describe("breakdownSegments", () => {
  it("sorts biggest first and drops zero or unparseable amounts", () => {
    const { segments } = breakdownSegments(
      [
        { category: "Food", amount: "20.10" },
        { category: "Rent", amount: "900" },
        { category: "Nothing", amount: "0" },
        { category: "Broken", amount: "abc" },
      ],
      4,
    );
    expect(segments.map((s) => [s.label, s.amount])).toEqual([
      ["Rent", "900"],
      ["Food", "20.10"],
    ]);
  });

  it("sums the folded tail exactly, without float drift", () => {
    const { segments } = breakdownSegments(
      [
        { category: "A", amount: "100" },
        { category: "B", amount: "0.1" },
        { category: "C", amount: "0.2" },
      ],
      1,
    );
    // 0.1 + 0.2 as floats is 0.30000000000000004.
    expect(segments[1]).toMatchObject({ label: "Other", amount: "0.3" });
  });

  it("keeps amounts beyond float precision intact", () => {
    const { segments } = breakdownSegments([{ category: "Big", amount: "12345678901234567.891" }], 4);
    expect(segments[0].amount).toBe("12345678901234567.891");
  });
});
