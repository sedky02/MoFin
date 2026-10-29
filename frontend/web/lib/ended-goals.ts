import type { Goal } from "@/lib/types";

export interface EndedGroup {
  /** "2026-09", so groups sort and compare as plain strings. */
  key: string;
  /** "September 2026", in UTC like the rest of the goal dates. */
  label: string;
  goals: Goal[];
}

/** Ended goals as a history: newest ended first, grouped under the month they were ended in. */
export function groupEndedGoals(goals: Goal[]): EndedGroup[] {
  const ended = goals
    .filter((g) => g.archivedAt)
    .sort((a, b) => new Date(b.archivedAt!).getTime() - new Date(a.archivedAt!).getTime());

  const groups: EndedGroup[] = [];
  for (const goal of ended) {
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
