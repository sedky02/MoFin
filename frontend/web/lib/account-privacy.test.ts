import { describe, expect, it } from "vitest";
import {
  accountVisibility,
  excludedFromTotals,
  hiddenCaption,
  isAmountHidden,
  selectableOnDashboard,
  visibilityOf,
  withVisibility,
} from "@/lib/account-privacy";

const acct = (visibility?: unknown, extra: Record<string, unknown> = {}) => ({
  id: String(visibility ?? "plain"),
  currency: "TND",
  metadata: { ...(visibility === undefined ? {} : { visibility }), ...extra },
});

describe("accountVisibility", () => {
  it.each([
    ["visible", { maskValue: false, countInTotals: true, showOnDashboard: true }],
    ["masked", { maskValue: true, countInTotals: true, showOnDashboard: true }],
    ["private", { maskValue: true, countInTotals: false, showOnDashboard: true }],
    ["hidden", { maskValue: true, countInTotals: false, showOnDashboard: false }],
  ])("%s", (level, effects) => {
    expect(accountVisibility(acct(level))).toEqual(effects);
  });

  it("reads an account with no level, or a bad one, as visible", () => {
    expect(visibilityOf(acct())).toBe("visible");
    expect(visibilityOf(acct("secret"))).toBe("visible");
    expect(visibilityOf(undefined)).toBe("visible");
  });

  it("reads the old flag as private, so cached data from before keeps its meaning", () => {
    expect(visibilityOf(acct(undefined, { hideAmount: true }))).toBe("private");
  });

  it("masks the value for every level but visible", () => {
    expect(["visible", "masked", "private", "hidden"].map((l) => isAmountHidden(acct(l)))).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });
});

describe("withVisibility", () => {
  it("sets the level and keeps every other key, dropping the old flag", () => {
    expect(withVisibility({ note: "x", hideAmount: true }, "masked")).toEqual({ note: "x", visibility: "masked" });
  });

  it("stores nothing for visible, the default", () => {
    expect(withVisibility({ note: "x", visibility: "private" }, "visible")).toEqual({ note: "x" });
    expect(withVisibility(undefined, "visible")).toEqual({});
  });
});

describe("what the dashboard offers and counts", () => {
  const accounts = [acct("visible"), acct("masked"), acct("private"), acct("hidden")];

  it("offers every account but the hidden ones", () => {
    expect(selectableOnDashboard(accounts).map((a) => a.id)).toEqual(["visible", "masked", "private"]);
  });

  it("lists the accounts left out of All accounts, per currency when asked", () => {
    expect(excludedFromTotals(accounts)).toEqual(["private", "hidden"]);
    expect(excludedFromTotals(accounts, "USD")).toEqual([]);
    expect(excludedFromTotals(undefined)).toEqual([]);
  });
});

describe("hiddenCaption", () => {
  it("is empty with none and counts them otherwise", () => {
    expect(hiddenCaption(0)).toBe("");
    expect(hiddenCaption(1)).toBe(" · excl. 1 hidden account");
    expect(hiddenCaption(2)).toBe(" · excl. 2 hidden accounts");
  });
});
