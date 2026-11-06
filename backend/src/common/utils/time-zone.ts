import { z } from 'zod';

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isTimeZone, 'unknown time zone');

export function localDate(instant: Date, timeZone = 'UTC'): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

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
 * A transaction dated "yesterday" is stored at local noon, so it shows on that day in the user's
 * zone (UTC midnight reads as the day before west of Greenwich).
 */
export function localNoon(date: string, timeZone = 'UTC'): Date {
  const utcNoon = new Date(`${date}T12:00:00Z`);
  return new Date(
    utcNoon.getTime() - offsetMinutes(utcNoon, timeZone) * 60_000,
  );
}
