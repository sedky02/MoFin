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

export function TransactionRow({ tx }: { tx: Transaction }) {
  // Expenses display as negative + red; income positive + green; transfer neutral.
  const base = transactionAmount(tx);
  const signedAmount = tx.type === "EXPENSE" ? multiply(base, "-1") : base;

  const isIncome = tx.type === "INCOME";
  const tint = isIncome ? "var(--success)" : tx.category?.color || "var(--muted-foreground)";

  return (
    <Link
      href={`/transactions/${tx.id}`}
      className={cn(
        "group flex items-center gap-4 bg-card px-4 py-3.5 transition-colors hover:bg-secondary/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-xl border"
        style={{
          backgroundColor: `color-mix(in oklab, ${tint} 14%, transparent)`,
          borderColor: `color-mix(in oklab, ${tint} 24%, transparent)`,
          color: tint,
        }}
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
          {(tx.isRecurring || tx.parentTransactionId) && (
            <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Recurring" />
          )}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {tx.category && (
            <span className="flex items-center gap-1.5">
              <CategoryDot color={tx.category.color} />
              <span className="truncate">{tx.category.name}</span>
              <span aria-hidden>·</span>
            </span>
          )}
          <span className="tabular">{formatDate(tx.occurredAt)}</span>
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
