import type { Transaction } from "@/lib/types";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function dayLabel(iso: string, now: Date): { key: string; label: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { key: iso, label: iso };
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const key = dayKey(d);
  if (key === dayKey(now)) return { key, label: "Today" };
  if (key === dayKey(yesterday)) return { key, label: "Yesterday" };
  const label = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  }).format(d);
  return { key, label };
}

export interface DayGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

export function groupByDay<T extends Pick<Transaction, "occurredAt">>(rows: T[], now: Date): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const tx of rows) {
    const { key, label } = dayLabel(tx.occurredAt, now);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(tx);
    else groups.push({ key, label, rows: [tx] });
  }
  return groups;
}
