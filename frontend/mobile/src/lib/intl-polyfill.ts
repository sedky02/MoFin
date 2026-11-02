// Hermes on iOS has no Intl.NumberFormat.prototype.formatToParts (Android does), and the copied
// money code (src/core/format.ts) relies on it. Install a small stand-in built from `format()` so
// the copy can stay byte-identical to the web. It only needs to be right for what that code reads:
// which part is the currency, which are the digits, and where the sign and spaces sit.
//
// Not covered: `notation: "compact"` (Hermes iOS ignores it). That needs a device check, see the
// phase 2 notes in docs/mobile/PROGRESS.md.

type Part = { type: Intl.NumberFormatPartTypes; value: string };

// A run of digits with grouping/decimal separators (no-break spaces included), e.g. "1,234.50",
// "1 234,50", plus an English compact suffix ("1.5K").
const NUMBER_RUN = /\d(?:[\d.,\u00a0\u202f\u2009'\u2019]*\d)?[KMBT]?/;
const SIGN = /^[-−]$/;

function tokenize(text: string, isCurrency: boolean): Part[] {
  const parts: Part[] = [];
  for (const token of text.split(/([-−]|\s+)/)) {
    if (!token) continue;
    if (SIGN.test(token)) parts.push({ type: "minusSign", value: token });
    else if (/^\s+$/.test(token)) parts.push({ type: "literal", value: token });
    else parts.push({ type: isCurrency ? "currency" : "literal", value: token });
  }
  return parts;
}

export function partsFromFormatted(formatted: string, isCurrency: boolean): Part[] {
  const match = NUMBER_RUN.exec(formatted);
  if (!match) return [{ type: "literal", value: formatted }];
  const before = formatted.slice(0, match.index);
  const after = formatted.slice(match.index + match[0].length);
  return [...tokenize(before, isCurrency), { type: "integer", value: match[0] }, ...tokenize(after, isCurrency)];
}

/** Adds `formatToParts` where the runtime lacks it. Returns true when it installed the stand-in. */
export function installNumberFormatToParts(): boolean {
  const proto = Intl.NumberFormat.prototype as unknown as {
    formatToParts?: (value: number | bigint) => Part[];
    format: (value: number | bigint) => string;
    resolvedOptions: () => Intl.ResolvedNumberFormatOptions;
  };
  if (typeof proto.formatToParts === "function") return false;
  Object.defineProperty(proto, "formatToParts", {
    configurable: true,
    writable: true,
    value: function formatToParts(this: typeof proto, value: number | bigint): Part[] {
      return partsFromFormatted(this.format(value), this.resolvedOptions().style === "currency");
    },
  });
  return true;
}
