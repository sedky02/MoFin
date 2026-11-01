import { describe, expect, it } from "vitest";
import { ACTIVE_SECTION_OFFSET, activeSectionAt, SETTINGS_SECTIONS } from "@/lib/settings-sections";

// Tops measured from the viewport: negative once a section has scrolled past the top.
const tops = (values: number[]) => Object.fromEntries(SETTINGS_SECTIONS.map((s, i) => [s.id, values[i]]));

describe("activeSectionAt", () => {
  it("starts on the first section at the top of the page", () => {
    expect(activeSectionAt(tops([200, 700, 1200, 1700, 2100, 2250, 2400]), false)).toBe("profile");
  });

  it("switches as soon as the next section's top reaches the offset, not when the last one leaves", () => {
    // Preferences' top is 100px down, above the 140px offset, while Profile's bottom is still on screen.
    expect(activeSectionAt(tops([-300, 100, 600, 1100, 1500, 1650, 1800]), false)).toBe("preferences");
    // 20px short of the offset: still on Profile.
    expect(activeSectionAt(tops([-300, ACTIVE_SECTION_OFFSET + 20, 600, 1100, 1500, 1650, 1800]), false)).toBe("profile");
  });

  it("treats a top exactly at the offset as reached", () => {
    expect(activeSectionAt(tops([-300, ACTIVE_SECTION_OFFSET, 600, 1100, 1500, 1650, 1800]), false)).toBe("preferences");
  });

  it("stays on the section being read through a tall one", () => {
    expect(activeSectionAt(tops([-1500, -900, -300, 400, 800, 950, 1100]), false)).toBe("security");
  });

  it("is the last section at the bottom of the page, even if it never reached the offset", () => {
    expect(activeSectionAt(tops([-1500, -1200, -900, -500, 200, 310, 420]), true)).toBe("delete-account");
  });

  it("skips sections that aren't on the page", () => {
    expect(activeSectionAt({ profile: -50, security: 80 }, false)).toBe("security");
    expect(activeSectionAt({}, false)).toBe("profile");
  });

  it("has a unique id for every section", () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
