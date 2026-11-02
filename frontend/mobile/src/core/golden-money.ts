// Expected formatMoney output for fixed inputs. Used by format.golden.test.ts (Node) and
// meant to be rendered on a device to confirm Hermes' Intl matches (phase 2 manual QA).
export const GOLDEN_MONEY: [amount: string, currency: string, compact: boolean, expected: string][] = [
  ["1234.5", "USD", false, "$1,234.50"],
  ["1234.5", "EUR", false, "€1,234.50"],
  ["1234.5", "TND", false, "1,234.500 TND"],
  ["1234", "JPY", false, "¥1,234"],
  ["-1234.5", "USD", false, "-$1,234.50"],
  ["-5.5", "TND", false, "-5.500 TND"],
  ["0", "USD", false, "$0.00"],
  ["123456789.01", "USD", false, "$123,456,789.01"],
  ["1234567", "USD", true, "$1.2M"],
  ["1500", "EUR", true, "€1.5K"],
  ["1500", "TND", true, "1.5K TND"],
  ["-2500", "USD", true, "-$2.5K"],
];
