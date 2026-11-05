import { z } from 'zod';

/** True for an IANA zone name the runtime knows ("Africa/Tunis", "UTC"). */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** An IANA time zone sent by a client (the browser's or the phone's). */
export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isTimeZone, 'unknown time zone');

/** The calendar date (YYYY-MM-DD) that `instant` falls on in `timeZone`. */
export function localDate(instant: Date, timeZone = 'UTC'): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Minutes `timeZone` is ahead of UTC at `instant` (Tunis: 60, New York: -300 or -240). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '');
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/**
 * Noon on a calendar date in `timeZone`, as an instant. A transaction dated
 * "yesterday" is stored at local noon so that it shows on that same day in the
 * user's zone, whatever their offset (UTC midnight would read as the day
 * before anywhere west of Greenwich).
 */
export function localNoon(date: string, timeZone = 'UTC'): Date {
  const utcNoon = new Date(`${date}T12:00:00Z`);
  return new Date(
    utcNoon.getTime() - offsetMinutes(utcNoon, timeZone) * 60_000,
  );
}
