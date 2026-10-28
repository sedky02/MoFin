import { RecurringInterval } from '@prisma/client';

/**
 * Advances a recurring occurrence by one interval, clamping to the anchor's
 * day-of-month when the target month is shorter (e.g. Jan 31 -> Feb 28 -> Mar 31).
 * `anchor` is always the root transaction's original occurredAt, so the clamp
 * is computed against the fixed anchor day rather than compounding drift.
 *
 * UTC throughout (matching AnalyticsService.getMonthlySummary and
 * GoalsService's period bounds) — `anchorDay` must come from `getUTCDate()`
 * too, since mixing a local-time day-of-month with UTC month arithmetic here
 * would reintroduce the same server-timezone-dependent bug at month
 * boundaries (audit DATA-XX).
 */
export function computeNextOccurrence(
  anchorDay: number,
  from: Date,
  interval: RecurringInterval,
): Date {
  const monthsToAdd = interval === RecurringInterval.MONTHLY ? 1 : 12;
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + monthsToAdd;
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, daysInTargetMonth);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/**
 * Whether a series' next occurrence falls after its end date. The end date is
 * inclusive: an occurrence landing exactly on it is still posted. A series
 * past its end is ended (CANCELLED with no next occurrence) rather than left
 * active, so the cron never posts a charge the user excluded.
 */
export function isPastEndDate(
  nextOccurrenceAt: Date,
  recurringEndDate: Date | null | undefined,
): boolean {
  return recurringEndDate ? nextOccurrenceAt > recurringEndDate : false;
}

/**
 * The first occurrence of a series on or after `day`, stepping its cursor
 * forward one interval at a time from `from` (clamped against the anchor day,
 * like the cron).
 */
export function firstOccurrenceOnOrAfter(
  anchorDay: number,
  from: Date,
  interval: RecurringInterval,
  day: Date,
): Date {
  let next = from;
  while (next < day) next = computeNextOccurrence(anchorDay, next, interval);
  return next;
}
