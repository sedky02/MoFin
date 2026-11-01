// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CategoryIcon } from "@/components/dashboard/category-icon";

afterEach(cleanup);

/** The lucide icon a name gets, from the class lucide puts on its svg. */
function iconOf(name: string | undefined): string {
  const { container } = render(<CategoryIcon name={name} />);
  const svg = container.querySelector("svg");
  return [...(svg?.classList ?? [])].find((c) => c.startsWith("lucide-") && c !== "lucide") ?? "";
}

describe("CategoryIcon: the starter categories", () => {
  it.each([
    ["Food", "lucide-utensils-crossed"],
    ["Drinks", "lucide-coffee"],
    ["Rent", "lucide-house"],
    ["Subscriptions", "lucide-repeat"],
    ["Transport", "lucide-car"],
    ["Freelance", "lucide-briefcase"],
    ["Salary", "lucide-banknote"],
    ["Allowance", "lucide-banknote"],
    ["Trade", "lucide-trending-up"],
  ])("%s gets its own icon, not the generic receipt", (name, icon) => {
    expect(iconOf(name)).toBe(icon);
  });

  it("still falls back to a receipt for a name it doesn't know", () => {
    expect(iconOf("Misc stuff")).toBe("lucide-receipt");
    expect(iconOf(undefined)).toBe("lucide-receipt");
  });

  it("keeps the older names on their icons", () => {
    expect(iconOf("Groceries")).toBe("lucide-utensils-crossed");
    expect(iconOf("Utilities")).toBe("lucide-zap");
  });
});
