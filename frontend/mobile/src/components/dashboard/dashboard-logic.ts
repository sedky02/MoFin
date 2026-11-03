import { tryParse } from '@/core/decimal';
import type { CategoryBreakdownItem, MonthlySeriesPoint } from '@/core/types';

export interface YearMonth {
  year: number;
  month: number;
}

/** The current month as the API counts months: in UTC (not the device's local month). */
export function currentUtcMonth(now: Date): YearMonth {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** Calendar month `offset` months before (year, month), in UTC. */
export function shiftMonth(year: number, month: number, offset: number): YearMonth {
  const d = new Date(Date.UTC(year, month - 1 - offset, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** "October 2026" for a UTC month. */
export function monthTitle(year: number, month: number, locale?: string): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Month names for the series' "YYYY-MM" keys. */
export const seriesMonthShort = (m: string, locale?: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
export const seriesMonthLong = (m: string, locale?: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Top categories shown before the rest fold into "Other". */
export const MAX_SEGMENTS = 4;

export interface Segment {
  label: string;
  amount: string;
  value: number;
  /** Index into the chart ramp, or -1 for "Other" (drawn in the muted colour). */
  colorIndex: number;
  /** Rounded share of the total, in percent. */
  share: number;
}

/**
 * The donut's slices: biggest first, the first four kept, the rest folded into "Other".
 * The ramp index follows rank, as on the web.
 */
export function buildSegments(raw: CategoryBreakdownItem[]): Segment[] {
  const sorted = raw
    .map((item) => ({ label: item.category, amount: item.amount, value: tryParse(item.amount)?.toNumber() ?? 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const sum = sorted.reduce((acc, s) => acc + s.value, 0);
  const share = (v: number) => (sum > 0 ? Math.round((v / sum) * 100) : 0);
  const head = sorted.slice(0, MAX_SEGMENTS).map((s, i) => ({ ...s, colorIndex: i, share: share(s.value) }));
  const restValue = sorted.slice(MAX_SEGMENTS).reduce((acc, s) => acc + s.value, 0);
  return restValue > 0
    ? [...head, { label: 'Other', amount: String(restValue), value: restValue, colorIndex: -1, share: share(restValue) }]
    : head;
}

export interface Arc {
  dash: number;
  gap: number;
  offset: number;
}

/** Stroke-dash arcs for a donut of circumference `c`; a small gap separates neighbours. */
export function donutArcs(values: number[], c: number): Arc[] {
  const total = values.reduce((s, v) => s + Math.max(v, 0), 0);
  if (total <= 0) return [];
  const gap = values.length > 1 ? 3 : 0;
  let acc = 0;
  return values.map((v) => {
    const f = Math.max(v, 0) / total;
    const dash = Math.max(f * c - gap, 0);
    const arc = { dash, gap: c - dash, offset: -acc * c };
    acc += f;
    return arc;
  });
}

/** Text alternative for the donut. */
export function donutDescription(kind: 'Spending' | 'Income', segments: Segment[]): string {
  const parts = segments.map((s) => `${s.label} ${s.share}%`).join(', ');
  return parts ? `${kind} by category: ${parts}` : `${kind} by category: nothing recorded`;
}

export interface Bar {
  month: string;
  value: number;
  /** Height as a percent of the tallest bar (>= 3 when non-zero). */
  pct: number;
  isNow: boolean;
}

/** Bars of the six-month chart for one metric, scaled to the largest absolute value. */
export function chartBars(points: MonthlySeriesPoint[], metric: 'expenses' | 'income' | 'balance'): { bars: Bar[]; max: number } {
  const values = points.map((p) => tryParse(p[metric])?.toNumber() ?? 0);
  const max = Math.max(...values.map(Math.abs), 0);
  const last = points.length - 1;
  return {
    max,
    bars: points.map((p, i) => ({
      month: p.month,
      value: values[i],
      pct: max > 0 ? Math.max((Math.abs(values[i]) / max) * 100, values[i] === 0 ? 0 : 3) : 0,
      isNow: i === last,
    })),
  };
}
