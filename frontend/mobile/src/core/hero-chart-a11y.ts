import { formatMoney } from "@/core/format";
import { tryParse } from "@/core/decimal";
import type { MonthlySeriesPoint } from "@/core/types";

export type ChartMetric = "expenses" | "income" | "balance";

/** A missing or unparseable figure reads as zero in the currency's precision. */
const amountOrZero = (value: string | undefined, currency: string) =>
  formatMoney(value !== undefined && tryParse(value) ? value : "0", currency);

/** Accessible name of one month's bar, e.g. "October 2026: balance $12,345.67". */
export function barLabel(
  monthLabel: string,
  metric: ChartMetric,
  point: MonthlySeriesPoint,
  currency: string,
): string {
  return `${monthLabel}: ${metric} ${amountOrZero(point[metric], currency)}`;
}

/** Rows of the screen-reader table that mirrors the chart: Month / Income / Expenses / Balance. */
export function chartTableRows(
  points: MonthlySeriesPoint[],
  currency: string,
  monthLabel: (month: string) => string,
): string[][] {
  return points.map((p) => [
    monthLabel(p.month),
    amountOrZero(p.income, currency),
    amountOrZero(p.expenses, currency),
    amountOrZero(p.balance, currency),
  ]);
}
