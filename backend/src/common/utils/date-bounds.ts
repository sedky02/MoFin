const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Date-range bounds coming from the API.
 *
 * A date-only value ("2026-10-24") names a whole calendar day, so as an upper
 * bound it has to cover that day up to its last instant. Parsed as-is it is
 * 00:00 on that day, and an inclusive `lte` on it drops everything after
 * midnight. A full ISO datetime is an exact instant and stays inclusive.
 *
 * Days are UTC for now, like every other period in the API. This is the one
 * place that decides where a day starts and ends, so per-user timezones (B-18)
 * only need to change it here.
 */

/** Whether `value` is a bare calendar date (YYYY-MM-DD) rather than a datetime. */
export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value.trim());
}

/** Start of a date-only day (00:00 UTC), or the exact instant of a datetime. */
export function lowerBound(value: string): Date {
  return new Date(value.trim());
}

/** First instant after the bound: the next day's 00:00 for a date-only value. */
export function exclusiveUpperBound(value: string): Date {
  const trimmed = value.trim();
  const match = DATE_ONLY.exec(trimmed);
  if (!match) return new Date(new Date(trimmed).getTime() + 1);
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
}

/**
 * Last instant the bound still covers (23:59:59.999 for a date-only value), for
 * period ends stored inclusively, like recurring goal periods. Timestamps are
 * stored to the millisecond, so `lte` on this equals `lt` the next day.
 */
export function inclusiveUpperBound(value: string): Date {
  return new Date(exclusiveUpperBound(value).getTime() - 1);
}

/** Prisma filter for an upper bound: `lt` the next day for a date-only value, `lte` an exact instant. */
export function upperBoundFilter(value: string): { lt: Date } | { lte: Date } {
  return isDateOnly(value) ? { lt: exclusiveUpperBound(value) } : { lte: new Date(value.trim()) };
}
