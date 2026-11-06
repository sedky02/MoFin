import type { Goal } from "@/core/types";

export interface CancelledGroup {
  /** "2026-09", so groups sort and compare as plain strings. */
  key: string;
  label: string;
  goals: Goal[];
}

export function groupCancelledGoals(goals: Goal[]): CancelledGroup[] {
  const cancelled = goals
    .filter((g) => g.archivedAt)
    .sort((a, b) => new Date(b.archivedAt!).getTime() - new Date(a.archivedAt!).getTime());

  const groups: CancelledGroup[] = [];
  for (const goal of cancelled) {
    const date = new Date(goal.archivedAt!);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date),
        goals: [],
      };
      groups.push(group);
    }
    group.goals.push(goal);
  }
  return groups;
}
