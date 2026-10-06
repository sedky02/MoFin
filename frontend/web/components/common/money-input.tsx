"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { currencySymbol, formatMoneyInput, normalizeMoneyTyping } from "@/lib/format";

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  currency?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-invalid"?: boolean;
}

/**
 * Money text field. Stores the raw decimal string in form state (validated by Zod
 * via parseMoneyInput); tidies to 2dp on blur. Currency code shown as a suffix.
 */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  currency,
  disabled,
  className,
  id,
  ...aria
}: MoneyInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Locale-aware: "12,50" -> "12.50", "1.234,56" -> "1234.56".
    onChange(normalizeMoneyTyping(e.target.value));
  }

  function handleBlur() {
    if (value) {
      const tidy = formatMoneyInput(value, currency);
      if (tidy) onChange(tidy);
    }
    onBlur?.();
  }

  const symbol = currencySymbol(currency);
  const currencyId = id && currency ? `${id}-currency` : undefined;

  return (
    <div className="relative">
      {symbol && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground tabular"
        >
          {symbol}
        </span>
      )}
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className={cn("tabular", symbol ? "pl-7" : "pl-3", currency && "pr-14", className)}
        aria-describedby={currencyId}
        {...aria}
      />
      {currency && (
        <span
          id={currencyId}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
        >
          {currency}
        </span>
      )}
    </div>
  );
}
