const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parses the few duration strings this app uses ('15m', '30d'); local to avoid depending on `ms`. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`Unsupported duration format: ${value}`);
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}
