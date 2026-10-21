import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS, isBottomNavActive } from "./nav-items";

describe("mobile bottom nav", () => {
  it("lists Dashboard, Transactions, Add, Goals in order", () => {
    expect(BOTTOM_NAV_ITEMS.map((i) => i.barLabel ?? i.label)).toEqual([
      "Dashboard",
      "Transactions",
      "New Transaction",
      "Goals",
    ]);
  });

  it("matches sections by prefix and the dashboard exactly", () => {
    expect(isBottomNavActive("/goals/abc", "/goals")).toBe(true);
    expect(isBottomNavActive("/dashboard", "/dashboard")).toBe(true);
    expect(isBottomNavActive("/dashboard/x", "/dashboard")).toBe(false);
  });

  it("counts transaction detail pages, but not the add form, as the list slot", () => {
    expect(isBottomNavActive("/transactions/abc-123", "/search")).toBe(true);
    expect(isBottomNavActive("/transactions/new", "/search")).toBe(false);
    expect(isBottomNavActive("/transactions/new", "/transactions/new")).toBe(true);
    expect(isBottomNavActive("/transactions/abc-123", "/transactions/new")).toBe(false);
  });
});
