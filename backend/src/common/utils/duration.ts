const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
};

/**
 * Parses the small subset of duration strings this app actually uses
 * (e.g. '15m', '30d') into milliseconds. Kept local instead of pulling in the
 * `ms` package as a direct dependency for one conversion.
 */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`Unsupported duration format: ${value}`);
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}
