import { describe, expect, it } from "vitest";
import { describeCategoryUsage, isCategoryInUse } from "@/lib/category-usage";

describe("describeCategoryUsage", () => {
  it("is null for an unused category", () => {
    expect(describeCategoryUsage({ transactions: 0, budgets: 0 })).toBeNull();
  });

  it("counts transactions, singular and plural", () => {
    expect(describeCategoryUsage({ transactions: 1, budgets: 0 })).toBe("Used by 1 transaction");
    expect(describeCategoryUsage({ transactions: 12, budgets: 0 })).toBe("Used by 12 transactions");
  });

  it("mentions budgets too", () => {
    expect(describeCategoryUsage({ transactions: 2, budgets: 1 })).toBe(
      "Used by 2 transactions and 1 budget",
    );
    expect(describeCategoryUsage({ transactions: 0, budgets: 2 })).toBe("Used by 2 budgets");
  });
});

describe("isCategoryInUse", () => {
  it("is true when anything still points at the category", () => {
    expect(isCategoryInUse({ transactions: 0, budgets: 0 })).toBe(false);
    expect(isCategoryInUse({ transactions: 1, budgets: 0 })).toBe(true);
    expect(isCategoryInUse({ transactions: 0, budgets: 1 })).toBe(true);
  });
});
