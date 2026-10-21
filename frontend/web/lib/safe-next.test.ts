import { describe, expect, it } from "vitest";
import { loginUrlWithNext } from "@/lib/safe-next";

describe("loginUrlWithNext", () => {
  it("is plain /login for the default destination", () => {
    expect(loginUrlWithNext("/dashboard")).toBe("/login");
    expect(loginUrlWithNext("https://evil.example")).toBe("/login");
  });

  it("keeps the return path, query included", () => {
    expect(loginUrlWithNext("/transactions/new")).toBe("/login?next=%2Ftransactions%2Fnew");
    expect(loginUrlWithNext("/transactions?type=EXPENSE")).toBe(
      "/login?next=%2Ftransactions%3Ftype%3DEXPENSE",
    );
  });

  it("adds the reason after the return path", () => {
    expect(loginUrlWithNext("/transactions/new", "expired")).toBe(
      "/login?next=%2Ftransactions%2Fnew&reason=expired",
    );
    expect(loginUrlWithNext("/dashboard", "expired")).toBe("/login?reason=expired");
  });
});
