"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Transaction } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { formatDate, transactionAmount } from "@/lib/format";
import { multiply } from "@/lib/decimal";
import { cn } from "@/lib/utils";

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

  return (
    <Link
      href={`/transactions/${tx.id}`}
      className={cn(
        "group flex items-center gap-4 bg-card px-4 py-3.5 transition-colors hover:bg-secondary/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.description}</p>
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
