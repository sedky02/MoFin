// The dashboard's weekly chart: which days, what they're called, the y-axis scale and what the
// headline says. Days are local calendar days (YYYY-MM-DD) in the viewer's time zone; weeks start
// on Monday. Shared by the web dashboard and the mobile app (copied to its src/core).
import { add, subtract, tryParse } from "@/lib/decimal";
import type { HeroChip, HeroHeadline, HeroMetric } from "@/lib/hero-headline";
import type { DailySeriesPoint } from "@/lib/types";

/** A local Date as YYYY-MM-DD. */
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** YYYY-MM-DD plus `n` calendar days. */
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week holding `iso`. */
export function mondayOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysIso(iso, day === 0 ? -6 : 1 - day);
}

/** The viewer's IANA time zone, for the API to count days the way they see them. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions, locale?: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { ...opts, timeZone: "UTC" });

/** "Mon" */
export const dayShort = (iso: string, locale?: string) => fmt(iso, { weekday: "short" }, locale);
/** "Monday, Nov 2" */
export const dayLong = (iso: string, locale?: string) =>
  fmt(iso, { weekday: "long", month: "short", day: "numeric" }, locale);

/** "Nov 2 – 8", or "Oct 26 – Nov 1" across a month end. */
export function weekRange(monday: string, locale?: string): string {
  const sunday = addDaysIso(monday, 6);
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  return `${fmt(monday, { month: "short", day: "numeric" }, locale)} – ${fmt(
    sunday,
    sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" },
    locale,
  )}`;
}

/** The pager's title: "This week", "Last week", or the date range. */
export function weekTitle(monday: string, today: string, locale?: string): string {
  const current = mondayOf(today);
  if (monday === current) return "This week";
  if (monday === addDaysIso(current, -7)) return "Last week";
  return weekRange(monday, locale);
}

/** Days of the week that have happened (today included); later days have no figures yet. */
export function pastDays(points: DailySeriesPoint[], today: string): DailySeriesPoint[] {
  return points.filter((p) => p.date <= today);
}

/** A round step for about `parts` gridlines: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(range: number, parts: number): number {
  const raw = range / parts;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10;
  return unit * power;
}

export interface WeekScale {
  /** Bottom and top of the axis; zero is always inside (bars grow from zero). */
  min: number;
  max: number;
  /** Gridline values, top to bottom. */
  ticks: number[];
}

/**
 * The y-axis for a week's values: round gridlines that always include zero, going below zero when
 * a value is negative (a balance can be).
 */
export function weekScale(values: number[], parts = 3): WeekScale {
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  if (hi === lo) return { min: 0, max: 1, ticks: [1, 0] };
  const step = niceStep(hi - lo, parts);
  const max = Math.ceil(hi / step) * step;
  const min = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = max; v >= min - step / 2; v -= step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max, ticks };
}

/** Where a value sits on the axis, as a fraction from the top (0) to the bottom (1). */
export function scaleY(value: number, scale: WeekScale): number {
  return (scale.max - value) / (scale.max - scale.min);
}

function sum(points: DailySeriesPoint[], key: "income" | "expenses"): string {
  return points.reduce((total, p) => add(total, p[key]), "0");
}

function chip(delta: string, suffix: string, prefix: string | null, upIsBad: boolean): HeroChip | null {
  const d = tryParse(delta);
  if (!d || d.isZero()) return null;
  const up = !d.isNegative();
  return { prefix, delta, suffix, tone: up === upIsBad ? "bad" : "good" };
}

/**
 * What the hero says for a week. `points` is 14 days: the week before, then the week shown.
 *  - balance: this week shows the live balance; an earlier week shows its closing balance. The chip
 *    is the week's change.
 *  - expenses / income: the week's total so far, and the change against the week before.
 */
export function weekHeadline(
  metric: HeroMetric,
  points: DailySeriesPoint[],
  monday: string,
  today: string,
  live: { amount: string; caption: string },
  locale?: string,
): HeroHeadline {
  const before = points.filter((p) => p.date < monday);
  const week = pastDays(
    points.filter((p) => p.date >= monday),
    today,
  );
  const current = monday === mondayOf(today);
  const range = weekRange(monday, locale);

  if (metric === "balance") {
    const end = week[week.length - 1]?.balance;
    const start = before[before.length - 1]?.balance;
    return {
      amount: current || !end ? live.amount : end,
      caption: current || !end ? live.caption : `Balance at the end of ${range}`,
      chip: end && start ? chip(subtract(end, start), current ? "this week" : "that week", "Balance change", false) : null,
    };
  }

  const spent = metric === "expenses";
  const amount = sum(week, metric);
  const caption = `${spent ? "Spent" : "Earned"} ${current ? "this week" : range}`;
  if (before.length === 0) return { amount, caption, chip: null };
  return { amount, caption, chip: chip(subtract(amount, sum(before, metric)), "vs the week before", null, spent) };
}
