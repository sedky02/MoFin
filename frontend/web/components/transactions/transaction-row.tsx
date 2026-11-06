"use client";

import Link from "next/link";
import { ChevronRight, Repeat } from "lucide-react";
import type { Transaction } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { formatDate, transactionAmount } from "@/lib/format";
import { multiply } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/dashboard/category-icon";
import { transactionCategorySummary } from "@/lib/transaction-category";

const TYPE_TILE: Record<Transaction["type"], string> = {
  INCOME: "bg-green-500/15 text-green-700 dark:bg-green-400/15 dark:text-green-400",
  EXPENSE: "bg-red-500/10 text-red-600 dark:bg-red-400/15 dark:text-red-400",
  TRANSFER: "bg-muted text-foreground/70",
};

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
  accountLabel?: string;
  /** "glance": for lists already grouped by day: no per-row date, inset separator instead of full-width dividers. */
  variant?: "default" | "glance";
}) {
  const glance = variant === "glance";
  const base = transactionAmount(tx);
  const signedAmount = tx.type === "EXPENSE" ? multiply(base, "-1") : base;

  const isIncome = tx.type === "INCOME";
  const isRecurring = tx.isRecurring || !!tx.parentTransactionId;
  const filedUnder = transactionCategorySummary(tx);
  const showCategory = !!tx.category || tx.type !== "TRANSFER";

  return (
    <Link
      href={`/transactions/${tx.id}`}
      className={cn(
        "group relative flex items-center gap-4 bg-card px-4 py-3.5 transition-colors hover:bg-secondary/60 active:bg-secondary",
        glance && "after:absolute after:bottom-0 after:left-[4.75rem] after:right-4 after:h-px after:bg-border last:after:hidden",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TYPE_TILE[tx.type])}>
        <CategoryIcon name={filedUnder.category?.name ?? tx.description} className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.description}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {/* Category and date share a line that never wraps; the category truncates instead. */}
          {(showCategory || !glance) && (
            <span className="flex min-w-0 max-w-full items-center gap-2">
              {showCategory && (
                <span className="flex min-w-0 items-center gap-1.5">
                  <CategoryDot color={filedUnder.category?.color} />
                  <span className="truncate">
                    {filedUnder.split && (
                      <>
                        Split <span aria-hidden>·</span>{" "}
                      </>
                    )}
                    {filedUnder.label}
                  </span>
                  {/* Before the date, always; before the account, only where it fits beside the category (a wrapped account would leave the dot dangling). */}
                  {(!glance || accountLabel) && (
                    <span aria-hidden className={glance ? "hidden sm:inline" : undefined}>
                      ·
                    </span>
                  )}
                </span>
              )}
              {!glance && <span className="tabular shrink-0">{formatDate(tx.occurredAt)}</span>}
            </span>
          )}
          {accountLabel && (
            <>
              {/* With a date on the row, a phone gives the account its own line so category and date keep theirs.
                  Grouped under a day heading there is no date, so the account shares the category's line. */}
              {!glance && <span aria-hidden className="hidden sm:inline">·</span>}
              <span className={cn("min-w-0 truncate", !glance && "basis-full sm:basis-auto")}>{accountLabel}</span>
            </>
          )}
          {isRecurring && <Repeat className="size-3 shrink-0" aria-label="Recurring" />}
        </div>
      </div>

      <MoneyAmount
        amount={tx.type === "TRANSFER" ? base : signedAmount}
        currency={tx.currency}
        // No colour: income carries a "+" and spending its "−", all in the normal text colour.
        signed={isIncome}
        className="text-sm font-semibold"
      />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
