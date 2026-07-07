// Money formatting + input parsing. All display goes through here so currency is
// never hardcoded and amounts always render with tabular figures.
import { Decimal, tryParse } from "@/lib/decimal";
import type { Transaction } from "@/lib/types";

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
    const parts = getFormatter(currency, opts?.compact ?? false).formatToParts(
      d.toNumber(),
    );
    const currencyPart = parts.find((p) => p.type === "currency");
    // Currencies without a symbol render as their letter code (e.g. "TND") and
    // Intl places that code BEFORE the amount ("TND 30"). Convention for
    // code-style currencies is to trail the amount ("30 TND"), so move it right.
    // Symbol currencies ("$", "€") keep Intl's default placement.
    if (currencyPart && /^[A-Za-z]+$/.test(currencyPart.value)) {
      const numeric = parts
        .filter(
          (p) =>
            p.type !== "currency" &&
            !(p.type === "literal" && p.value.trim() === ""),
        )
        .map((p) => p.value)
        .join("");
      return `${numeric} ${currencyPart.value}`;
    }
    return parts.map((p) => p.value).join("");
  } catch {
    // Unknown currency code — fall back to raw value + code rather than throwing.
    return `${d.toString()} ${currency}`;
  }
}

/**
 * Positive display amount for a transaction, derived from its ledger legs.
 * A Transaction has no amount column; the money lives in `items`. Both legs of
 * a TRANSFER carry the same amount, so the first item is correct for all types.
 */
export function transactionAmount(tx: Transaction): string {
  return tx.items[0]?.amount ?? "0";
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

/** Goal progress as a 0-100 ratio for a progress bar. Clamped — an EXPENSE goal can exceed 100%. */
export function goalProgressRatio(progressAmount: string, targetAmount: string): number {
  const progress = tryParse(progressAmount);
  const target = tryParse(targetAmount);
  if (!progress || !target || target.isZero()) return 0;
  const ratio = progress.dividedBy(target).toNumber() * 100;
  return Math.min(100, Math.max(0, ratio));
}

export { Decimal };
