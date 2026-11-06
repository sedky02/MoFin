"use client";

import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useRevealedAmount } from "@/hooks/use-revealed-amount";
import { isAmountHidden, MASKED_AMOUNT } from "@/lib/account-privacy";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * An account's amount, or dots when the user hid that account's amounts, with an eye button to
 * show or hide it again. Accounts that aren't hidden render `children` unchanged, with no button.
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
  /** For the dots: the same type size as the amount they stand for. */
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
