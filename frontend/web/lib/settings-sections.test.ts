import { describe, expect, it } from "vitest";
import { pickActiveSection, SETTINGS_SECTIONS } from "@/lib/settings-sections";

describe("pickActiveSection", () => {
  it("picks the first visible section in page order", () => {
    expect(pickActiveSection(new Set(["data", "security"]), undefined)).toBe("security");
  });

  it("keeps the previous section while none is visible", () => {
    expect(pickActiveSection(new Set(), "preferences")).toBe("preferences");
  });

  it("starts on the first section", () => {
    expect(pickActiveSection(new Set(), undefined)).toBe("profile");
  });

  it("ignores ids that aren't sections", () => {
    expect(pickActiveSection(new Set(["footer"]), "data")).toBe("data");
  });

  it("has an id for every section that is unique", () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
