import { subtract, tryParse } from "@/core/decimal";
import type { MonthlySeriesPoint } from "@/core/types";

export type HeroMetric = "expenses" | "income" | "balance";

export interface HeroChip {
  /** Text before the amount ("Balance change"), or null when the amount leads. */
  prefix: string | null;
  /** Signed difference, never zero. */
  delta: string;
  /** Text after the amount ("this month", "vs Sep"). */
  suffix: string;
  /** Good or bad news for the user, not the sign: more spending is "bad". */
  tone: "good" | "bad";
}

export interface HeroHeadline {
  amount: string;
  caption: string;
  chip: HeroChip | null;
}

const monthName = (month: string, style: "short" | "long", locale?: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale, { month: style, timeZone: "UTC" });

/**
 * What the hero says for the chosen metric from monthly `points` (oldest first): the live balance,
 * or this month's total against last; more spending is bad news, more income good.
 */
export function heroHeadline(
  metric: HeroMetric,
  points: MonthlySeriesPoint[],
  balance: { amount: string; caption: string },
  locale?: string,
): HeroHeadline {
  const current = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : undefined;

  if (metric === "balance") {
    const a = current && tryParse(current.balance);
    const b = previous && tryParse(previous.balance);
    const diff = a && b ? a.minus(b) : null;
    return {
      amount: balance.amount,
      caption: balance.caption,
      chip:
        diff && !diff.isZero()
          ? { prefix: "Balance change", delta: diff.toString(), suffix: "this month", tone: diff.isNegative() ? "bad" : "good" }
          : null,
    };
  }

  const spent = metric === "expenses";
  if (!current) return { amount: "0", caption: spent ? "Spent this month" : "Earned this month", chip: null };

  const amount = current[metric];
  const caption = `${spent ? "Spent" : "Earned"} in ${monthName(current.month, "long", locale)}`;
  if (!previous || !tryParse(amount) || !tryParse(previous[metric])) return { amount, caption, chip: null };

  const delta = subtract(amount, previous[metric]);
  const parsed = tryParse(delta);
  if (!parsed || parsed.isZero()) return { amount, caption, chip: null };
  // Spending going up and income going down are the bad cases.
  const up = !parsed.isNegative();
  return {
    amount,
    caption,
    chip: { prefix: null, delta, suffix: `vs ${monthName(previous.month, "short", locale)}`, tone: up === spent ? "bad" : "good" },
  };
}
