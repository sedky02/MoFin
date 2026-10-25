import type { Goal, GoalProgressSource } from "@/lib/types";

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

/**
 * The rule behind each goal type, shown under the scope line in the goal dialog: whether
 * transfers count, and when the goal is judged. Matches GoalsService on the backend.
 */
export function goalRuleHint(type: Goal["type"]): string {
  switch (type) {
    case "INCOME":
      return "Transfers in don't count. Once reached, it stays achieved for the rest of the period.";
    case "EXPENSE":
      return "Transfers out don't count. Judged when the period ends.";
    default:
      return "Saving? A Balance goal tracks the account's balance, so transfers in count. Once reached, it stays achieved for the rest of the period.";
  }
}

/** Caption for a goal history row, saying where its progress comes from. */
export function goalProgressSourceLabel(source: GoalProgressSource): string {
  switch (source) {
    case "LIVE":
      return "Current period (live)";
    case "ENDED":
      return "Frozen when the goal was ended";
    default:
      return "Recorded at period end";
  }
}
