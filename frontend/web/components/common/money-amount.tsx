"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { tryParse } from "@/lib/decimal";
import { useCountUp } from "@/hooks/use-count-up";

interface MoneyAmountProps {
  amount: string;
  currency: string;
  /** Spring count-up on first mount (dashboard balances). */
  animate?: boolean;
  /** Abbreviate large values ("$1.2K"). */
  compact?: boolean;
  /** Color by sign: positive = success, negative = destructive. */
  colorBySign?: boolean;
  /** Prefix a +/- sign explicitly (for transaction rows). */
  signed?: boolean;
  className?: string;
}

export function MoneyAmount({
  amount,
  currency,
  animate = false,
  compact = false,
  colorBySign = false,
  signed = false,
  className,
}: MoneyAmountProps) {
  const parsed = tryParse(amount);
  const target = parsed ? parsed.toNumber() : 0;
  const animated = useCountUp(target, { enabled: animate });

  const displayValue = animate ? animated.toString() : amount;
  const formatted = formatMoney(
    // While animating, drop the negative sign mid-flight to avoid flicker.
    displayValue,
    currency,
    { compact },
  );

  const isNeg = parsed?.isNegative() ?? false;
  const sign = signed && parsed && !parsed.isZero() ? (isNeg ? "" : "+") : "";

  return (
    <span
      className={cn(
        "tabular",
        colorBySign && (isNeg ? "text-destructive" : "text-success"),
        className,
      )}
      // Keep the final value accessible/copyable even during animation.
      aria-label={formatMoney(amount, currency)}
      title={formatMoney(amount, currency)}
    >
      {sign}
      {formatted}
    </span>
  );
}
