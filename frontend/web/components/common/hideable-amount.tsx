"use client";

import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useRevealedAmount } from "@/hooks/use-revealed-amount";
import { isAmountHidden, MASKED_AMOUNT } from "@/lib/account-privacy";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Dots when the user hid the account's amounts, with an eye button to show or hide again; other
 * accounts render `children` unchanged.
 */
export function HideableAmount({
  account,
  currency,
  className,
  toggle = true,
  children,
}: {
  account: Pick<Account, "id" | "name" | "metadata"> | undefined;
  currency: string;
  /** The eye button that reveals the amount until reload. Off where the saved choice has its own button. */
  toggle?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [revealed, setRevealed] = useRevealedAmount(account?.id);
  if (!account || !isAmountHidden(account)) return <>{children}</>;
  const name = account.name;
  return (
    <span className="inline-flex items-center gap-1">
      {revealed && toggle ? (
        children
      ) : (
        <span className={cn("tabular", className)} aria-label={`${name} balance hidden`}>
          {MASKED_AMOUNT} {currency}
        </span>
      )}
      {toggle && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          onClick={() => setRevealed(!revealed)}
          aria-label={revealed ? `Hide the balance of ${name}` : `Show the balance of ${name}`}
          aria-pressed={revealed}
        >
          {revealed ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </Button>
      )}
    </span>
  );
}
