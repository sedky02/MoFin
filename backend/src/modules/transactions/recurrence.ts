import { RecurringInterval } from '@prisma/client';

/**
 * Advances one interval, clamping to the anchor's day of month (Jan 31 -> Feb 28 -> Mar 31).
 * `anchor` is the root's original occurredAt, so the clamp doesn't compound drift. UTC throughout.
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
 * The end date is inclusive. A series past its end is ended (CANCELLED, no next occurrence) rather
 * than left active, so the cron never posts a charge the user excluded.
 */
export function isPastEndDate(
  nextOccurrenceAt: Date,
  recurringEndDate: Date | null | undefined,
): boolean {
  return recurringEndDate ? nextOccurrenceAt > recurringEndDate : false;
}

/**
 * Steps the cursor forward one interval at a time from `from`, clamped against the anchor day like
 * the cron.
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
