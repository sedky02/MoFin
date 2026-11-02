import type { Goal, GoalProgressSource } from "@/core/types";

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

/**
 * What the two figures on a goal row mean for each type: the target, and the progress counted
 * against it. Shown under the type picker in the goal dialog. Matches GoalsService on the backend.
 */
export function goalExplainer(type: Goal["type"]): { target: string; progress: string } {
  switch (type) {
    case "INCOME":
      return {
        target: "The income you want to bring into the account during the period.",
        progress: "Income received so far. Transfers in don't count.",
      };
    case "EXPENSE":
      return {
        target: "A spending limit: the most you want to spend during the period.",
        progress: "What you've spent so far. Transfers out don't count. Going over the limit fails the goal.",
      };
    default:
      return {
        target: "The balance you want the account to reach.",
        progress: "The account's balance right now, so transfers in count.",
      };
  }
}

/** Caption for a goal history row, saying where its progress comes from. */
export function goalProgressSourceLabel(source: GoalProgressSource): string {
  switch (source) {
    case "LIVE":
      return "Current period (live)";
    case "ENDED":
      return "Frozen when the goal was cancelled";
    default:
      return "Recorded at period end";
  }
}
