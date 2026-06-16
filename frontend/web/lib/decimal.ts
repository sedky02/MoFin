// Decimal-safe money arithmetic. NEVER use native +, -, *, parseFloat or Number()
// on money strings — they lose precision. Everything here is string-in / string-out.
import Decimal from "decimal.js";

// Banker-safe defaults for currency math.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export function add(a: string, b: string): string {
  return new Decimal(a).plus(b).toString();
}

export function subtract(a: string, b: string): string {
  return new Decimal(a).minus(b).toString();
}

export function multiply(a: string, b: string): string {
  return new Decimal(a).times(b).toString();
}

export function isGreaterThan(a: string, b: string): boolean {
  return new Decimal(a).greaterThan(b);
}

export function isZero(a: string): boolean {
  return new Decimal(a).isZero();
}

export function isNegative(a: string): boolean {
  return new Decimal(a).isNegative();
}

export function fromNumber(n: number): string {
  return new Decimal(n).toString();
}

export function toDisplayString(d: Decimal): string {
  return d.toString();
}

// Safe parse: returns a Decimal or null without throwing.
export function tryParse(raw: string): Decimal | null {
  try {
    const d = new Decimal(raw);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

export { Decimal };
