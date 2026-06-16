// Money formatting + input parsing. All display goes through here so currency is
// never hardcoded and amounts always render with tabular figures.
import { Decimal, tryParse } from "@/lib/decimal";

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const cacheKey = `${currency}:${compact}`;
  let fmt = formatterCache.get(cacheKey);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency, // ALWAYS the API-provided currency — never hardcoded
      ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
    });
    formatterCache.set(cacheKey, fmt);
  }
  return fmt;
}

/**
 * Format a decimal money string for display.
 * @param amount  decimal string from the API
 * @param currency  ISO currency code from the API
 * @param opts.compact  abbreviate (e.g. "$1.2K") for dashboard cards
 */
export function formatMoney(
  amount: string,
  currency: string,
  opts?: { compact?: boolean },
): string {
  const d = tryParse(amount);
  if (!d) return amount; // fail visible, not silent
  try {
    // Intl works on numbers; we only convert AFTER decimal-safe storage, for display.
    return getFormatter(currency, opts?.compact ?? false).format(d.toNumber());
  } catch {
    // Unknown currency code — fall back to code + raw value rather than throwing.
    return `${currency} ${d.toString()}`;
  }
}

/**
 * Parse raw user input into a clean positive decimal string, or null if invalid.
 * Strips everything except digits, "." and "-".
 */
export function parseMoneyInput(raw: string): string | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;
  // reject multiple dots
  if ((cleaned.match(/\./g) || []).length > 1) return null;
  const d = tryParse(cleaned);
  if (!d) return null;
  if (d.isNegative() || d.isZero()) return null; // amounts must be > 0
  return d.toString();
}

/**
 * Format a decimal string for an <input> (no symbol, 2 decimal places).
 * Returns "" for empty/invalid so the field can be cleared.
 */
export function formatMoneyInput(amount: string): string {
  const d = tryParse(amount);
  if (!d) return "";
  return d.toFixed(2);
}

/**
 * Ledger balance keys are either "<currency>" (queried with accountId) or
 * "<accountId>:<currency>" (queried without). Split safely.
 */
export function parseBalanceKey(key: string): {
  accountId?: string;
  currency: string;
} {
  const idx = key.lastIndexOf(":");
  if (idx === -1) return { currency: key };
  return { accountId: key.slice(0, idx), currency: key.slice(idx + 1) };
}

/** Currency-match guard used in the transaction form's Zod superRefine. */
export function validateAccountCurrency(
  account: { currency: string },
  currency: string,
): boolean {
  return account.currency === currency;
}

// ---- Non-money display helpers ----

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Datetime-local input value (YYYY-MM-DDTHH:mm) from an ISO string or now. */
export function toDatetimeLocal(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export { Decimal };
