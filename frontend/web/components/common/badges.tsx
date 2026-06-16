"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { TransactionType, DraftStatus, AccountType } from "@/lib/types";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";

export function TypeBadge({
  type,
  className,
}: {
  type: TransactionType;
  className?: string;
}) {
  const map = {
    INCOME: {
      label: "Income",
      icon: ArrowDownLeft,
      cls: "bg-success/12 text-success",
    },
    EXPENSE: {
      label: "Expense",
      icon: ArrowUpRight,
      cls: "bg-destructive/12 text-destructive",
    },
    TRANSFER: {
      label: "Transfer",
      icon: ArrowLeftRight,
      cls: "bg-primary/12 text-primary",
    },
  } as const;
  const { label, icon: Icon, cls } = map[type];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        cls,
        className,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

/** Confidence pill: green ≥0.8, yellow ≥0.5, red <0.5. */
export function ConfidencePill({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const pct = Math.round(score * 100);
  const tier =
    score >= 0.8
      ? "bg-success/15 text-success"
      : score >= 0.5
        ? "bg-warning/15 text-warning"
        : "bg-destructive/15 text-destructive";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular",
        tier,
        className,
      )}
      title={`AI confidence: ${pct}%`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {pct}%
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: DraftStatus;
  className?: string;
}) {
  const map = {
    PENDING: "bg-warning/15 text-warning",
    APPROVED: "bg-success/15 text-success",
    REJECTED: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        map[status],
        className,
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CASH: "Cash",
  BANK: "Bank",
  SAVINGS: "Savings",
  CRYPTO: "Crypto",
};

export function AccountTypeBadge({
  type,
  className,
}: {
  type: AccountType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground",
        className,
      )}
    >
      {ACCOUNT_TYPE_LABEL[type]}
    </span>
  );
}
