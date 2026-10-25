"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatMoneyInput,
  moneyInputHint,
  moneyInputPrefix,
  normalizeMoneyTyping,
  normalizeSignedMoneyTyping,
  pasteMoneyText,
  signedMoneyInputHint,
} from "@/lib/format";

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  currency?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Hero style: bare, centred, oversized figure with the currency code above. */
  large?: boolean;
  /** Accept one leading minus (an opening balance can be below zero). */
  allowNegative?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Space-joined element ids, skipping empty ones. */
function ids(...parts: (string | undefined)[]): string | undefined {
  const joined = parts.filter(Boolean).join(" ");
  return joined || undefined;
}

/**
 * Money text field. Form state holds exactly what was typed (validated by Zod
 * via parseMoneyInput, which reads any separators); it's normalised and tidied
 * to the currency's decimals on blur, and on paste when the reading is clear.
 * While the text could be read more than one way ("1,234") or will be rounded,
 * the interpreted value is shown under the field ("= 1,234.00").
 */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  currency,
  disabled,
  className,
  id,
  large,
  allowNegative = false,
  "aria-describedby": describedBy,
  ...aria
}: MoneyInputProps) {
  const autoId = React.useId();
  const baseId = id ?? autoId;
  const hintId = `${baseId}-hint`;
  const hint = allowNegative ? signedMoneyInputHint(value, currency) : moneyInputHint(value, currency);
  // Phone decimal keypads have no minus key, so a signed field asks for the full keyboard.
  const inputMode = allowNegative ? "text" : "decimal";

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Keep the raw text. Normalising per keystroke turned "1," into "1." and
    // so "1,234" into 1.234.
    onChange(e.target.value);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    onChange(pasteMoneyText(el.value, start, end, pasted, allowNegative));
  }

  function handleBlur() {
    const normalize = allowNegative ? normalizeSignedMoneyTyping : normalizeMoneyTyping;
    const normalized = value ? normalize(value) : null;
    if (normalized !== null) {
      const tidy = formatMoneyInput(normalized, currency);
      if (tidy && tidy !== value) onChange(tidy);
    }
    onBlur?.();
  }

  const hintRegion = (
    <div id={hintId} aria-live="polite">
      {hint && (
        <p
          data-slot="money-input-hint"
          className={cn("tabular mt-1 text-xs text-muted-foreground", large && "text-center text-sm")}
        >
          {hint}
        </p>
      )}
    </div>
  );

  if (large) {
    return (
      <div className="text-center">
        <span aria-hidden className="mb-1 block h-4 text-xs font-medium tracking-widest text-muted-foreground">
          {currency}
        </span>
        <input
          id={id}
          inputMode={inputMode}
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          onBlur={handleBlur}
          disabled={disabled}
          aria-label={currency ? `Amount in ${currency}` : "Amount"}
          aria-describedby={ids(describedBy, hintId)}
          className={cn(
            "tabular w-full bg-transparent text-center text-5xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/30 disabled:opacity-60 sm:text-6xl",
            "aria-invalid:text-destructive",
            className,
          )}
          {...aria}
        />
        {hintRegion}
      </div>
    );
  }

  const symbol = moneyInputPrefix(currency);
  const currencyId = currency ? `${baseId}-currency` : undefined;

  return (
    <div>
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
          inputMode={inputMode}
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          onBlur={handleBlur}
          disabled={disabled}
          // Room for the prefix: one character ("$") or two ("zł").
          className={cn("tabular", !symbol ? "pl-3" : symbol.length > 1 ? "pl-9" : "pl-7", currency && "pr-14", className)}
          aria-describedby={ids(describedBy, currencyId, hintId)}
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
      {hintRegion}
    </div>
  );
}
