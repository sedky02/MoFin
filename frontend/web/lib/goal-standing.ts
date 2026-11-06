import type { Goal } from "@/lib/types";
import { isGreaterThan, tryParse } from "@/lib/decimal";

/** Which group a goal sits in on the Goals page. */
export type GoalStanding = "attention" | "on-track" | "achieved";

/** What the progress ring is coloured for. `cancelled` is a goal that was stopped before it was judged. */
export type GoalTone = "failed" | "behind" | "on-track" | "achieved" | "cancelled";

export const STANDING_ORDER: GoalStanding[] = ["attention", "on-track", "achieved"];

export const STANDING_LABEL: Record<GoalStanding, string> = {
  attention: "Needs attention",
  "on-track": "On track",
  achieved: "Achieved",
};

/** How far progress may trail the share of the period gone before a goal counts as behind. */
const BEHIND_MARGIN = 0.15;

const DAY_MS = 86_400_000;

/** The calendar day of a date in UTC, as a day number: goal periods are UTC days. */
function utcDay(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/** Whether an expense goal has passed its cap. */
export function isOverLimit(goal: Goal): boolean {
  const instance = goal.currentInstance;
  return goal.type === "EXPENSE" && !!instance && isGreaterThan(instance.progressAmount, instance.targetAmount);
}

/** Share of the open period that has gone by (0-1), or null when the goal has no bounded period. */
function elapsedShare(goal: Goal, now: Date): number | null {
  const instance = goal.currentInstance;
  const start = instance ? new Date(instance.periodStart).getTime() : NaN;
  const end = instance ? new Date(instance.periodEnd).getTime() : NaN;
  if (!(end > start)) return null;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

/**
 * The ring's colour. A cancelled goal is judged by its frozen status; an active one is "behind"
 * when its progress trails the share of the period gone (for a cap: spending runs ahead).
 */
export function goalTone(goal: Goal, now: Date = new Date()): GoalTone {
  const instance = goal.currentInstance;
  if (!instance) return goal.archivedAt ? "cancelled" : "on-track";
  if (instance.status === "FAILED" || isOverLimit(goal)) return "failed";
  if (instance.status === "ACHIEVED") return "achieved";
  if (goal.archivedAt) return "cancelled";

  const elapsed = elapsedShare(goal, now);
  const progress = tryParse(instance.progressAmount);
  const target = tryParse(instance.targetAmount);
  if (elapsed === null || !progress || !target || target.isZero()) return "on-track";
  const used = Math.max(0, progress.dividedBy(target).toNumber());
  const behind = goal.type === "EXPENSE" ? used > elapsed + BEHIND_MARGIN : used < elapsed - BEHIND_MARGIN;
  return behind ? "behind" : "on-track";
}

export function goalStanding(goal: Goal, now: Date = new Date()): GoalStanding {
  const tone = goalTone(goal, now);
  if (tone === "failed" || tone === "behind") return "attention";
  return tone === "achieved" ? "achieved" : "on-track";
}

/** Active goals split into the page's groups, in display order, leaving out empty ones. */
export function groupGoalsByStanding(
  goals: Goal[],
  now: Date = new Date(),
): { standing: GoalStanding; goals: Goal[] }[] {
  return STANDING_ORDER.map((standing) => ({
    standing,
    goals: goals.filter((g) => goalStanding(g, now) === standing),
  })).filter((group) => group.goals.length > 0);
}

/** "Resets tomorrow", "Ends in 12 days": when the open period closes, or null for an open-ended or cancelled goal. */
export function goalTimeLeft(goal: Goal, now: Date = new Date()): string | null {
  const instance = goal.currentInstance;
  if (!instance || goal.archivedAt) return null;
  const end = new Date(instance.periodEnd);
  if (Number.isNaN(end.getTime())) return null;

  // The period runs to the end of its last day, so it closes (and a recurring goal resets) the day after.
  const daysLeft = utcDay(end) - utcDay(now) + 1;
  if (daysLeft < 1) return null;
  if (goal.isRecurring) return daysLeft === 1 ? "Resets tomorrow" : `Resets in ${daysLeft} days`;
  if (daysLeft === 1) return "Ends today";
  return daysLeft === 2 ? "Ends tomorrow" : `Ends in ${daysLeft - 1} days`;
}

/** "Monthly" / "Yearly" for a repeating goal, or null for a one-off. */
export function goalRepeatLabel(goal: Goal): string | null {
  if (!goal.isRecurring) return null;
  return goal.recurrenceUnit === "YEAR" ? "Yearly" : "Monthly";
}
