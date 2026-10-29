// Money formatting + input parsing. All display goes through here so currency is
// never hardcoded and amounts always render with tabular figures.
import { Decimal, add, tryParse } from "@/lib/decimal";
import type { LedgerBalance, Transaction, User } from "@/lib/types";

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
 * A Transaction has no amount column; the money lives in `items`. A TRANSFER's
 * two legs (from + to) both carry the full amount, so the first item is
 * correct there — but an INCOME/EXPENSE can be split into multiple items
 * whose amounts sum to the total, so those must be summed.
 */
export function transactionAmount(tx: Pick<Transaction, "type" | "items">): string {
  if (tx.type === "TRANSFER") return tx.items[0]?.amount ?? "0";
  return tx.items.reduce((sum, item) => add(sum, item.amount), "0");
}

/**
 * Parse raw user input (as typed, any separators) into a clean positive decimal
 * string, or null if invalid, negative or zero. Separators are read with
 * `interpretMoneyText`, so "12,50" is 12.5 and "1,234" is 1234 even when the
 * field was submitted before it was blurred and tidied.
 */
export function parseMoneyInput(raw: string): string | null {
  const value = normalizeMoneyTyping(raw);
  if (value === null) return null;
  const d = tryParse(value);
  if (!d || d.isZero()) return null; // amounts must be > 0
  return d.toString();
}

/**
 * Format a decimal string for an <input> (no symbol, 2 decimal places).
 * Returns "" for empty/invalid so the field can be cleared.
 */
export function formatMoneyInput(amount: string, currency?: string): string {
  const d = tryParse(amount);
  if (!d) return "";
  return d.toFixed(currencyFractionDigits(currency));
}

/** Minor-unit digits for a currency (JPY 0, USD 2, KWD/TND 3); 2 if unknown. */
export function currencyFractionDigits(currency?: string): number {
  if (!currency) return 2;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Currency symbol ("$", "€", "TND"…) or "" when unknown. */
export function currencySymbol(currency?: string): string {
  if (!currency) return "";
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * The symbol a money field shows before the amount, or "" when the symbol is
 * just the currency code ("TND", "CHF"): the field already shows the code after
 * the amount, and a 3-letter prefix doesn't fit in front of it.
 */
export function moneyInputPrefix(currency?: string): string {
  const symbol = currencySymbol(currency);
  return symbol && symbol !== currency ? symbol : "";
}

/** How `interpretMoneyText` read a piece of money text. */
export interface MoneyText {
  /** Plain dot-decimal string: no grouping, no sign, no exponent ("1234", "12.5"). */
  value: string;
  /**
   * True when a lone "," followed by exactly 3 digits ("1,234") was read as a
   * thousands separator. It could also have been meant as a decimal comma, so
   * the UI should show the reading back ("= 1,234.00") instead of guessing silently.
   */
  ambiguous: boolean;
}

/**
 * True for an integer part grouped by `sep`: "1,234", "12,345,678", and Indian
 * "1,23,45,678". The first group is 1-3 digits without a leading zero, the last
 * is exactly 3, and any in between are 2 or 3.
 */
function isGrouped(intPart: string, sep: "." | ","): boolean {
  const groups = intPart.split(sep);
  if (groups.length < 2) return false;
  const first = groups[0];
  const rest = groups.slice(1);
  return (
    /^[1-9]\d{0,2}$/.test(first) &&
    rest.every((g, i) => (i === rest.length - 1 ? /^\d{3}$/ : /^\d{2,3}$/).test(g))
  );
}

/**
 * Read money text as a person would type or paste it, in any common locale.
 * Pure and string-only (no floats), so it is safe for any amount and any currency.
 *
 * - Anything but digits, "." and "," is dropped ("$ 1 234,50" -> 1234.5).
 * - A minus sign makes it invalid: money fields here take positive amounts.
 * - Both separators present: the last one is the decimal point and the other
 *   must group the integer part ("1.234,56" and "1,234.56" -> 1234.56).
 * - The same separator repeated is grouping ("1,234,567" -> 1234567).
 * - A lone "," followed by exactly 3 digits, after 1-3 digits, is grouping
 *   ("1,234" -> 1234) and flagged `ambiguous`. Any other lone "," is a decimal
 *   comma ("12,5" -> 12.5, "0,500" -> 0.5).
 * - A lone "." is always a decimal point (3-decimal currencies exist).
 *
 * Returns null when there are no digits or the grouping is malformed ("1,2,3").
 */
export function interpretMoneyText(raw: string): MoneyText | null {
  if (raw == null || /[-−]/.test(raw)) return null;
  const s = raw.replace(/[^0-9.,]/g, "");
  if (!/\d/.test(s)) return null;

  const lastIdx = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (lastIdx === -1) return { value: plain(s), ambiguous: false };

  const sep = s[lastIdx] as "." | ",";
  const other = sep === "." ? "," : ".";
  const head = s.slice(0, lastIdx);
  const tail = s.slice(lastIdx + 1);

  if (head.includes(other)) {
    // Mixed: `sep` is the decimal point, `other` groups the integer part.
    if (head.includes(sep) || !isGrouped(head, other)) return null;
    return { value: plain(`${head.split(other).join("")}.${tail}`), ambiguous: false };
  }
  if (head.includes(sep)) {
    // Repeated separator: grouping only, no decimals.
    if (!isGrouped(s, sep)) return null;
    return { value: plain(s.split(sep).join("")), ambiguous: false };
  }
  if (sep === "," && isGrouped(s, ",")) {
    return { value: plain(head + tail), ambiguous: true };
  }
  return { value: plain(`${head || "0"}.${tail}`), ambiguous: false };
}

/** "007" -> "7", "12." -> "12", "12.50" -> "12.5". Input is digits with at most one ".". */
function plain(digits: string): string {
  return new Decimal(digits).toFixed();
}

/**
 * Dot-decimal value of what was typed into a money field ("12,50" -> "12.5"),
 * or null when it can't be read. See `interpretMoneyText` for the rules. Money
 * fields keep the raw text while typing and call this on blur / paste.
 */
export function normalizeMoneyTyping(raw: string): string | null {
  return interpretMoneyText(raw)?.value ?? null;
}

/**
 * Inline reading of a money field's raw text, e.g. "= 1,234.00", shown before
 * the field is tidied on blur. Only returned when the reading isn't obvious:
 * the text was `ambiguous`, or it has more decimals than the currency allows
 * and will be rounded ("1.234" in USD -> "= 1.23"). Otherwise null.
 */
export function moneyInputHint(raw: string, currency?: string, locale?: string): string | null {
  const parsed = interpretMoneyText(raw);
  if (!parsed) return null;
  const digits = currencyFractionDigits(currency);
  const d = new Decimal(parsed.value);
  if (!parsed.ambiguous && d.decimalPlaces() <= digits) return null;
  const fmt = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  // Intl formats decimal strings exactly; no float conversion.
  return `= ${fmt.format(d.toFixed(digits) as Intl.StringNumericLiteral)}`;
}

/**
 * Field text after pasting `pasted` over the `start`..`end` selection of
 * `current`. Clear pastes are normalised straight away ("1.234,56" -> "1234.56");
 * ambiguous or unreadable ones are kept as pasted so the hint / validation can
 * speak to them. `signed` keeps one leading minus, for fields that take negatives.
 */
export function pasteMoneyText(
  current: string,
  start: number,
  end: number,
  pasted: string,
  signed = false,
): string {
  const next = current.slice(0, start) + pasted + current.slice(end);
  const { negative, rest } = signed ? splitSign(next) : { negative: false, rest: next };
  const parsed = interpretMoneyText(rest);
  return parsed && !parsed.ambiguous ? withSign(negative, parsed.value) : next;
}

/**
 * One leading minus ("-", or the typographic "−") split off money text, so a
 * field that may go below zero can read the rest with the usual rules.
 */
function splitSign(raw: string): { negative: boolean; rest: string } {
  const match = /^\s*[-−]/.exec(raw);
  return match ? { negative: true, rest: raw.slice(match[0].length) } : { negative: false, rest: raw };
}

/** "-" + value, except for zero: "-0" reads as "0". */
function withSign(negative: boolean, value: string): string {
  return negative && !new Decimal(value).isZero() ? `-${value}` : value;
}

/**
 * `normalizeMoneyTyping` for a field that may go below zero (an account's
 * opening balance on a credit account): one leading minus is kept
 * ("-1.234,50" -> "-1234.5"); a minus anywhere else makes it unreadable.
 */
export function normalizeSignedMoneyTyping(raw: string): string | null {
  const { negative, rest } = splitSign(raw);
  const value = normalizeMoneyTyping(rest);
  return value === null ? null : withSign(negative, value);
}

/** `moneyInputHint` for a field that may go below zero ("-1,234" -> "= -1,234.00"). */
export function signedMoneyInputHint(raw: string, currency?: string, locale?: string): string | null {
  const { negative, rest } = splitSign(raw);
  const hint = moneyInputHint(rest, currency, locale);
  return hint && negative ? hint.replace(/^= /, "= -") : hint;
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

/**
 * Best-guess "primary" currency for currency-agnostic UI (e.g. the dashboard's
 * account-less view) when there's no single selected account to defer to.
 * Prefers the user's explicit setting, then the most common balance currency,
 * then `fallback` — pass the last-known/server-prefetched value there so a
 * client caller only ever shows a guess as a placeholder until live data
 * resolves, never as a silently "final" answer.
 */
export function pickPrimaryCurrency(
  balances: LedgerBalance[] | null | undefined,
  user: User | null | undefined,
  fallback = "",
  accounts?: { currency: string }[] | null,
): string {
  const settingCurrency = user?.settings?.defaultCurrency;
  if (typeof settingCurrency === "string" && settingCurrency) return settingCurrency;
  if (balances && balances.length) {
    // Most common currency among balances.
    const counts = new Map<string, number>();
    for (const b of balances) {
      const { currency } = parseBalanceKey(b.key);
      counts.set(currency, (counts.get(currency) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  // No settings and no ledger activity: the first account's currency, else the caller's
  // neutral fallback (empty, so nothing prints a currency the user never chose).
  return accounts?.[0]?.currency || fallback;
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

/**
 * A goal period's first or last day. The API's periods are UTC days (00:00 to
 * 23:59:59.999), so they're read in UTC: in local time a period ending
 * 23:59:59.999Z would show the next day east of UTC.
 */
export function formatPeriodDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
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
/** Whole percent of the target reached, uncapped (an expense at 117% of its cap says 117). 0 for a bad or zero target. */
export function goalPercent(progressAmount: string, targetAmount: string): number {
  const progress = tryParse(progressAmount);
  const target = tryParse(targetAmount);
  if (!progress || !target || target.isZero()) return 0;
  return Math.max(0, Math.round(progress.dividedBy(target).times(100).toNumber()));
}

export function goalProgressRatio(progressAmount: string, targetAmount: string): number {
  const progress = tryParse(progressAmount);
  const target = tryParse(targetAmount);
  if (!progress || !target || target.isZero()) return 0;
  const ratio = progress.dividedBy(target).toNumber() * 100;
  return Math.min(100, Math.max(0, ratio));
}

export { Decimal };
