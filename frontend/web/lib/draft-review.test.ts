import { describe, expect, it } from "vitest";
import { draftAmountInput } from "./draft-review";

describe("draftAmountInput", () => {
  it("keeps 3 decimals for a TND draft", () => {
    expect(draftAmountInput({ amount: "12.345", currency: "TND" })).toBe("12.345");
  });

  it("uses 2 decimals when the draft has no currency", () => {
    expect(draftAmountInput({ amount: "12.5", currency: "" })).toBe("12.50");
  });

  it("returns an empty field for a missing amount", () => {
    expect(draftAmountInput({ amount: "", currency: "TND" })).toBe("");
  });
});
