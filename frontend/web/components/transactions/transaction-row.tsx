"use client";

import Link from "next/link";
import { ChevronRight, Repeat, ArrowDownLeft } from "lucide-react";
import type { Transaction } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { formatDate, transactionAmount } from "@/lib/format";
import { multiply } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/dashboard/category-icon";

function CategoryDot({ color }: { color?: string | null }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color || "var(--muted-foreground)" }}
    />
  );
}

export function TransactionRow({
  tx,
  accountLabel,
  variant = "default",
}: {
  tx: Transaction;
  /** Shown in the meta line when the list spans several accounts. */
  accountLabel?: string;
  /** "glance": for lists already grouped by day: no per-row date, inset separator instead of full-width dividers. */
  variant?: "default" | "glance";
}) {
  const glance = variant === "glance";
  // Expenses display as negative + red; income positive + green; transfer neutral.
  const base = transactionAmount(tx);
  const signedAmount = tx.type === "EXPENSE" ? multiply(base, "-1") : base;

  const isIncome = tx.type === "INCOME";
  // Only income is tinted. Spending stays neutral; the category's colour already appears
  // once, as the dot in the meta line, so it isn't encoded twice.
  const tint = isIncome ? "var(--success)" : undefined;

  return (
    <Link
      href={`/transactions/${tx.id}`}
      className={cn(
        "group relative flex items-center gap-4 bg-card px-4 py-3.5 transition-colors hover:bg-secondary/60 active:bg-secondary",
        glance && "after:absolute after:bottom-0 after:left-[4.75rem] after:right-4 after:h-px after:bg-border last:after:hidden",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/70"
        style={
          tint
            ? { backgroundColor: `color-mix(in oklab, ${tint} 14%, transparent)`, color: tint }
            : undefined
        }
      >
        {isIncome ? (
          <ArrowDownLeft className="size-5" />
        ) : (
          <CategoryIcon name={tx.category?.name ?? tx.description} className="size-5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {tx.description}
          {tx.voidedAt && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Voided</span>}
          {tx.reversesTransactionId && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Reversal</span>}
          {(tx.isRecurring || tx.parentTransactionId) && (
            <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Recurring" />
          )}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {(tx.category || tx.type !== "TRANSFER") && (
            <span className="flex min-w-0 items-center gap-1.5">
              <CategoryDot color={tx.category?.color} />
              <span className="truncate">{tx.category?.name ?? "Uncategorized"}</span>
              {(!glance || accountLabel) && <span aria-hidden>·</span>}
            </span>
          )}
          {!glance && <span className="tabular shrink-0">{formatDate(tx.occurredAt)}</span>}
          {accountLabel && (
            <>
              {!glance && <span aria-hidden>·</span>}
              <span className="truncate">{accountLabel}</span>
            </>
          )}
        </div>
      </div>

      <MoneyAmount
        amount={tx.type === "TRANSFER" ? base : signedAmount}
        currency={tx.currency}
        colorBySign={tx.type !== "TRANSFER"}
        className="text-sm font-semibold"
      />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
