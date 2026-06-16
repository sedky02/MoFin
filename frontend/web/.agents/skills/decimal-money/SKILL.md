---
name: decimal-money
description: Decimal-safe money handling for MoFin using decimal.js — arithmetic helpers, Intl-based formatting, input parsing, and currency-match validation. Use for lib/decimal.ts, lib/format.ts, and any component that renders or accepts money.
---

# Decimal money

Money is ALWAYS a decimal string from the API. NEVER use native JS arithmetic
(`+`, `parseFloat`, `Number()`) on money. Use `decimal.js`.

## `lib/decimal.ts`

Wrap `decimal.js`. Export string-in/string-out helpers:

```ts
import Decimal from "decimal.js";

export function add(a: string, b: string): string { return new Decimal(a).plus(b).toString(); }
export function subtract(a: string, b: string): string { return new Decimal(a).minus(b).toString(); }
export function multiply(a: string, b: string): string { return new Decimal(a).times(b).toString(); }
export function isGreaterThan(a: string, b: string): boolean { return new Decimal(a).greaterThan(b); }
export function isZero(a: string): boolean { return new Decimal(a).isZero(); }
export function fromNumber(n: number): string { return new Decimal(n).toString(); }
export function toDisplayString(d: Decimal): string { return d.toString(); }
```

## `lib/format.ts`

```ts
formatMoney(amount: string, currency: string, opts?: { compact?: boolean }): string
```
- Uses `Intl.NumberFormat` with `style: "currency"`, ALWAYS passing the `currency` from the API.
  Never hardcode `"USD"`.
- `compact`: abbreviate thousands/millions for dashboard cards (`notation: "compact"` → "$1.2K").

```ts
parseMoneyInput(raw: string): string | null
```
- Strip everything except digits, `.`, and `-`. Return `null` if not a valid positive decimal
  (use `decimal.js` to validate; reject `NaN`, negative, multiple dots).

```ts
formatMoneyInput(amount: string): string
```
- Format a decimal string for an `<input>` (no currency symbol, fixed decimal places).

```ts
parseBalanceKey(key: string): { accountId?: string; currency: string }
```
- Ledger `key` is either `"<currency>"` (when queried with accountId) or
  `"<accountId>:<currency>"` (without). Split on `":"`.

## Validation helper

```ts
validateAccountCurrency(account: Account, currency: string): boolean
```
Returns `account.currency === currency`. Used in the transaction form's Zod `superRefine`.

## Multi-currency rendering

For a balance list with mixed currencies, group by currency and render each group with its own
`formatMoney(..., currency)` — never sum across currencies.
