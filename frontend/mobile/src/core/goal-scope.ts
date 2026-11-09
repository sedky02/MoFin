import type { Goal, GoalProgressSource } from "@/core/types";
import { tryParse } from "@/core/decimal";
import { formatMoney } from "@/core/format";

/**
 * Income/Expense goals count every transaction of that type on the goal's account (transfers
 * excluded); Balance goals follow the account balance.
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
      return "Frozen when the goal was cancelled";
    default:
      return "Recorded at period end";
  }
}

/** The card's big figure: what is left or over (a cap), or still to go or above (a reach goal). */
export interface GoalHeadline {
  amount: string;
  label: "left" | "over" | "to go" | "above";
}

export function goalHeadline(goal: Goal): GoalHeadline | null {
  const instance = goal.currentInstance;
  const target = tryParse(instance?.targetAmount ?? goal.targetAmount);
  const progress = tryParse(instance?.progressAmount ?? "0");
  if (!target || !progress) return null;
  const remaining = target.minus(progress);
  if (goal.type === "EXPENSE") {
    return remaining.isNegative()
      ? { amount: remaining.negated().toString(), label: "over" }
      : { amount: remaining.toString(), label: "left" };
  }
  return remaining.isPositive() && !remaining.isZero()
    ? { amount: remaining.toString(), label: "to go" }
    : { amount: remaining.negated().toString(), label: "above" };
}

/** A whole amount loses its zero cents ("$300"), the way people say a target out loud. */
export function formatTargetAmount(amount: string, currency: string): string {
  const formatted = formatMoney(amount, currency);
  return tryParse(amount)?.isInteger() ? formatted.replace(/[.,]0+(?=\D*$)/, "") : formatted;
}

/** The line under the big figure: the target it is measured against. */
export function goalTargetLine(goal: Goal, currency: string): string {
  const target = formatTargetAmount(goal.currentInstance?.targetAmount ?? goal.targetAmount, currency);
  const period = goal.isRecurring ? (goal.recurrenceUnit === "YEAR" ? " yearly" : " monthly") : "";
  switch (goal.type) {
    case "EXPENSE":
      return `of your ${target}${period} limit`;
    case "INCOME":
      return `of your ${target}${period} target`;
    default:
      return `to save ${target}`;
  }
}

/** What an Income/Expense goal counts when it has no category. */
export function goalAllCategoriesLabel(type: Goal["type"]): string {
  return type === "INCOME" ? "All income" : "All spending";
}
