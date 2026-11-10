import { add, tryParse } from "@/lib/decimal";
import { colorAt } from "./donut";

export interface BreakdownSegment {
  label: string;
  /** Decimal string, for display. */
  amount: string;
  /** Float, only for the ring's geometry and share percentages. */
  value: number;
  color: string;
}

/**
 * Colours come from the chart ramp in rank order (biggest slice first), not from each category's
 * own colour: the ramp is built to stay distinguishable and on-palette. Long tails make an
 * unreadable ring, so past `maxSegments` the rest fold into "Other".
 */
export function breakdownSegments(
  breakdown: { category: string; amount: string }[],
  maxSegments: number,
): { sorted: BreakdownSegment[]; segments: BreakdownSegment[] } {
  const sorted = breakdown
    .flatMap((item) => {
      const amount = tryParse(item.amount);
      return amount && amount.isPositive() && !amount.isZero()
        ? [{ label: item.category, amount: item.amount, decimal: amount }]
        : [];
    })
    .sort((a, b) => b.decimal.comparedTo(a.decimal))
    .map(({ label, amount, decimal }, i) => ({ label, amount, value: decimal.toNumber(), color: colorAt(i) }));

  const head = sorted.slice(0, maxSegments);
  const rest = sorted.slice(maxSegments);
  if (rest.length === 0) return { sorted, segments: head };

  const otherAmount = rest.reduce((sum, s) => add(sum, s.amount), "0");
  const other = {
    label: "Other",
    amount: otherAmount,
    value: rest.reduce((sum, s) => sum + s.value, 0),
    color: "var(--muted-foreground)",
  };
  return { sorted, segments: [...head, other] };
}
