// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TransactionRow } from "@/components/transactions/transaction-row";
import type { Transaction, TransactionType } from "@/lib/types";

afterEach(cleanup);

function tx(type: TransactionType, over: Partial<Transaction> = {}): Transaction {
  const leg = (direction: "DEBIT" | "CREDIT", accountId: string) => ({
    id: direction + accountId,
    transactionId: "t1",
    accountId,
    direction,
    amount: "25.00",
    currency: "USD",
  });
  return {
    id: "t1",
    type,
    description: "Something",
    currency: "USD",
    occurredAt: new Date(2026, 9, 28, 12).toISOString(),
    category: type === "TRANSFER" ? null : { id: "c", name: "Groceries", type: type === "INCOME" ? "INCOME" : "EXPENSE", color: "#22c55e", isSystem: false },
    items: type === "TRANSFER" ? [leg("DEBIT", "a1"), leg("CREDIT", "a2")] : [leg(type === "INCOME" ? "CREDIT" : "DEBIT", "a1")],
    createdAt: "",
    updatedAt: "",
    isRecurring: false,
    ...over,
  };
}

const amountClass = (container: HTMLElement) => container.querySelector(".tabular.font-semibold")?.className ?? "";

describe("TransactionRow amounts", () => {
  it("colours income green", () => {
    const { container } = render(<TransactionRow tx={tx("INCOME")} />);
    expect(amountClass(container)).toContain("text-success");
  });

  it("leaves spending neutral, with its minus sign, so a list of spending isn't a wall of red", () => {
    const { container } = render(<TransactionRow tx={tx("EXPENSE")} />);
    expect(amountClass(container)).not.toContain("text-destructive");
    expect(container.textContent).toContain("-$25.00");
  });

  it("leaves a transfer neutral", () => {
    const { container } = render(<TransactionRow tx={tx("TRANSFER")} />);
    expect(amountClass(container)).not.toMatch(/text-(success|destructive)/);
  });
});

describe("TransactionRow meta line", () => {
  it("shows the date on a default row and leaves it off a day-grouped one", () => {
    const { container, rerender } = render(<TransactionRow tx={tx("EXPENSE")} accountLabel="Main checking" />);
    expect(container.textContent).toMatch(/2026/);
    rerender(<TransactionRow tx={tx("EXPENSE")} accountLabel="Main checking" variant="glance" />);
    expect(container.textContent).not.toMatch(/2026/);
  });

  it("starts a transfer's account line flush left, with no empty wrapper pushing it over", () => {
    const { container } = render(<TransactionRow tx={tx("TRANSFER")} accountLabel="Main → Savings" variant="glance" />);
    const meta = container.querySelector("a > div:nth-of-type(2) > div")!;
    expect(meta.children).toHaveLength(1);
    expect(meta.textContent).toBe("Main → Savings");
  });

  it("hides the dot between category and account on a phone, where the account wraps", () => {
    const { container } = render(<TransactionRow tx={tx("EXPENSE")} accountLabel="Main checking" variant="glance" />);
    const dot = Array.from(container.querySelectorAll('span[aria-hidden="true"]')).find((el) => el.textContent === "·")!;
    expect(dot.className).toContain("hidden");
    expect(dot.className).toContain("sm:inline");
  });

  it("keeps the dot before the date on a default row, at every width", () => {
    const { container } = render(<TransactionRow tx={tx("EXPENSE")} accountLabel="Main checking" />);
    const dot = Array.from(container.querySelectorAll('span[aria-hidden="true"]')).find((el) => el.textContent === "·")!;
    expect(dot.className).not.toContain("hidden");
  });

  it("marks a recurring transaction", () => {
    const { container } = render(<TransactionRow tx={tx("EXPENSE", { isRecurring: true })} />);
    expect(container.querySelector('[aria-label="Recurring"]')).toBeTruthy();
  });
});
