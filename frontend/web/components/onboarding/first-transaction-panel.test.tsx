// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FirstTransactionPanel } from "@/components/onboarding/first-transaction-panel";

afterEach(cleanup);

describe("FirstTransactionPanel", () => {
  it("names the next step and offers its two ways in as two full-size links", () => {
    render(<FirstTransactionPanel />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Record your first transaction");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Record a transaction/ }).getAttribute("href")).toBe("/transactions/new");
    expect(screen.getByRole("link", { name: /Describe it in words/ }).getAttribute("href")).toBe("/drafts");
  });

  it("makes the plain route the filled one and the other an equal-size outline", () => {
    render(<FirstTransactionPanel />);
    const record = screen.getByRole("link", { name: /Record a transaction/ });
    const describe = screen.getByRole("link", { name: /Describe it in words/ });
    // Brand lime, with an outline so its edge shows on a white card (lime alone is 1.4:1 there).
    expect(record.className).toContain("bg-primary");
    expect(record.className).toContain("ring-primary-text/70");
    expect(record.className).not.toContain("bg-foreground");
    expect(describe.className).not.toContain("bg-primary");
    expect(describe.className).toContain("ring-foreground/40");
    // Same padding and layout: the two read as peers.
    expect(record.className).toContain("p-4");
    expect(describe.className).toContain("p-4");
  });
});
