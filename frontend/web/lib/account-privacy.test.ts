import { describe, expect, it } from "vitest";
import { isAmountHidden, MASKED_AMOUNT, withHideAmount } from "@/lib/account-privacy";

describe("isAmountHidden", () => {
  it("is true only when the account says so", () => {
    expect(isAmountHidden({ metadata: { hideAmount: true } })).toBe(true);
    expect(isAmountHidden({ metadata: { hideAmount: "true" } })).toBe(false);
    expect(isAmountHidden({ metadata: {} })).toBe(false);
    expect(isAmountHidden({ metadata: null })).toBe(false);
    expect(isAmountHidden(undefined)).toBe(false);
  });
});

describe("withHideAmount", () => {
  it("sets or clears the choice and keeps every other metadata key", () => {
    expect(withHideAmount({ color: "red" }, true)).toEqual({ color: "red", hideAmount: true });
    expect(withHideAmount({ color: "red", hideAmount: true }, false)).toEqual({ color: "red" });
    expect(withHideAmount(null, false)).toEqual({});
    expect(withHideAmount(undefined, true)).toEqual({ hideAmount: true });
  });
});

it("masks with dots, no digits", () => {
  expect(MASKED_AMOUNT).not.toMatch(/\d/);
});
