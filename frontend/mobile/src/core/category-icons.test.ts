import {
  CATEGORY_ICONS,
  categoryIconFor,
  collapsedCategoryIcons,
  orderedCategoryIcons,
} from "@/core/category-icons";

describe("category icons", () => {
  it("has a unique key and label for every icon", () => {
    expect(new Set(CATEGORY_ICONS.map((i) => i.key)).size).toBe(
      CATEGORY_ICONS.length,
    );
    expect(new Set(CATEGORY_ICONS.map((i) => i.label)).size).toBe(
      CATEGORY_ICONS.length,
    );
  });

  it("finds an icon by its stored key", () => {
    expect(categoryIconFor("cart")?.label).toBe("Groceries");
  });

  it("returns nothing for an old emoji, a blank or an unknown key, so those fall back", () => {
    expect(categoryIconFor("🍔")).toBeUndefined();
    expect(categoryIconFor("")).toBeUndefined();
    expect(categoryIconFor(null)).toBeUndefined();
    expect(categoryIconFor("nope")).toBeUndefined();
  });
});

describe("orderedCategoryIcons", () => {
  it("keeps the default order for an expense", () => {
    expect(orderedCategoryIcons("EXPENSE").map((i) => i.key)).toEqual(
      CATEGORY_ICONS.map((i) => i.key),
    );
  });

  it("puts the income icons first for an income, without losing or repeating any", () => {
    const keys = orderedCategoryIcons("INCOME").map((i) => i.key);
    expect(keys.slice(0, 3)).toEqual(["salary", "work", "investments"]);
    expect([...keys].sort()).toEqual(CATEGORY_ICONS.map((i) => i.key).sort());
  });
});

describe("collapsedCategoryIcons", () => {
  const icons = ["a", "b", "c", "d", "e"].map((key) => ({ key }));

  it("shows the first few", () => {
    expect(
      collapsedCategoryIcons(icons, undefined, 3).map((i) => i.key),
    ).toEqual(["a", "b", "c"]);
  });

  it("leaves it alone when the selected icon is already shown", () => {
    expect(collapsedCategoryIcons(icons, "b", 3).map((i) => i.key)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("swaps a hidden selected icon into the last slot, so the choice never disappears", () => {
    expect(collapsedCategoryIcons(icons, "e", 3).map((i) => i.key)).toEqual([
      "a",
      "b",
      "e",
    ]);
  });

  it("ignores a selection that isn't in the list, such as an old emoji", () => {
    expect(collapsedCategoryIcons(icons, "🍔", 3).map((i) => i.key)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
