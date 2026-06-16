import type { AccountType } from "@/lib/types";

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
  { value: "SAVINGS", label: "Savings" },
  { value: "CRYPTO", label: "Crypto" },
];

// Common ISO currencies for the picker (free-text also allowed where relevant).
export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "INR",
  "BTC",
  "ETH",
] as const;

// A friendly palette for user categories (no purple/violet, per brand).
export const CATEGORY_COLORS = [
  "#0d9488",
  "#0ea5e9",
  "#f59e0b",
  "#f43f5e",
  "#14b8a6",
  "#fb923c",
  "#22c55e",
  "#ef4444",
  "#eab308",
  "#06b6d4",
];
