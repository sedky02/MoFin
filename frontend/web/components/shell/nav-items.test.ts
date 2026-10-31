import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS, NAV_ITEMS, SIDEBAR_FOOTER_ITEM, SIDEBAR_GROUPS, isNavActive } from "./nav-items";

describe("nav items", () => {
  it("calls the transaction list Transactions and points it at /transactions", () => {
    expect(NAV_ITEMS.find((i) => i.label === "Transactions")?.href).toBe("/transactions");
    expect(NAV_ITEMS.some((i) => i.href === "/search" || i.label === "Search")).toBe(false);
  });
});

describe("sidebar groups", () => {
  it("puts Dashboard on its own, then Money, then Assistant", () => {
    expect(SIDEBAR_GROUPS.map((g) => [g.label, g.items.map((i) => i.label)])).toEqual([
      [undefined, ["Dashboard"]],
      ["Money", ["Transactions", "Accounts", "Categories", "Goals"]],
      ["Assistant", ["Drafts", "AI Connector"]],
    ]);
  });

  it("pins Settings below the groups", () => {
    expect(SIDEBAR_FOOTER_ITEM.href).toBe("/settings");
  });

  it("lists every page once, apart from New Transaction, which has its own button", () => {
    const hrefs = [...SIDEBAR_GROUPS.flatMap((g) => g.items), SIDEBAR_FOOTER_ITEM].map((i) => i.href).sort();
    expect(hrefs).toEqual(NAV_ITEMS.filter((i) => i.href !== "/transactions/new").map((i) => i.href).sort());
  });
});

describe("mobile bottom nav", () => {
  it("lists Dashboard, Transactions, Add, Goals in order", () => {
    expect(BOTTOM_NAV_ITEMS.map((i) => i.barLabel ?? i.label)).toEqual([
      "Dashboard",
      "Transactions",
      "New Transaction",
      "Goals",
    ]);
  });
});

describe("isNavActive", () => {
  it("matches sections by prefix and the dashboard exactly", () => {
    expect(isNavActive("/goals/abc", "/goals")).toBe(true);
    expect(isNavActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavActive("/dashboard/x", "/dashboard")).toBe(false);
  });

  it("matches whole path segments only", () => {
    expect(isNavActive("/goalsx", "/goals")).toBe(false);
  });

  it("counts the list and transaction pages, but not the add form, as Transactions", () => {
    expect(isNavActive("/transactions", "/transactions")).toBe(true);
    expect(isNavActive("/transactions/abc-123", "/transactions")).toBe(true);
    expect(isNavActive("/transactions/abc-123/edit", "/transactions")).toBe(true);
    expect(isNavActive("/transactions/new", "/transactions")).toBe(false);
    expect(isNavActive("/transactions/new", "/transactions/new")).toBe(true);
    expect(isNavActive("/transactions/abc-123", "/transactions/new")).toBe(false);
    expect(isNavActive("/transactions", "/transactions/new")).toBe(false);
  });
});
