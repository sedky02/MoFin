const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date-only value ("2026-10-24") names a whole day, so as an upper bound it must cover the day's
 * last instant. Days are UTC; this is the one place to change for per-user time zones (B-18).
 */

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
 * Last instant the bound covers (23:59:59.999 for a date-only value), for periods stored
 * inclusively; `lte` on it equals `lt` the next day.
 */
export function inclusiveUpperBound(value: string): Date {
  return new Date(exclusiveUpperBound(value).getTime() - 1);
}

/**
 * Prisma filter for an upper bound: `lt` the next day for a date-only value, `lte` an exact
 * instant.
 */
export function upperBoundFilter(value: string): { lt: Date } | { lte: Date } {
  return isDateOnly(value)
    ? { lt: exclusiveUpperBound(value) }
    : { lte: new Date(value.trim()) };
}
