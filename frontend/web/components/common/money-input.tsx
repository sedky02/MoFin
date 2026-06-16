"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoneyInput } from "@/lib/format";

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
    // Permit digits, one dot, and intermediate states while typing.
    const next = e.target.value.replace(/[^0-9.]/g, "");
    if ((next.match(/\./g) || []).length > 1) return;
    onChange(next);
  }

  function handleBlur() {
    if (value) {
      const tidy = formatMoneyInput(value);
      if (tidy) onChange(tidy);
    }
    onBlur?.();
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground tabular">
        $
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className={cn("tabular pl-7", currency && "pr-14", className)}
        {...aria}
      />
      {currency && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {currency}
        </span>
      )}
    </div>
  );
}
