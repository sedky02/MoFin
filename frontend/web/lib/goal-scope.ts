import type { Goal } from "@/lib/types";

/**
 * One line saying what a goal counts. Income/Expense goals count every transaction of that
 * type on the goal's account (transfers excluded); Balance goals follow the account balance.
 */
export function goalScopeLabel(type: Goal["type"], accountName?: string | null): string {
  const account = accountName?.trim() || "this account";
  switch (type) {
    case "INCOME":
      return `Counts all income into ${account}`;
    case "EXPENSE":
      return `Counts all expenses from ${account}`;
    default:
      return `Tracks the balance of ${account}`;
  }
}
