"use client";

import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import type { TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS: {
  value: TransactionType;
  label: string;
  icon: typeof ArrowDownLeft;
  active: string;
}[] = [
  { value: "EXPENSE", label: "Expense", icon: ArrowUpRight, active: "text-destructive" },
  { value: "INCOME", label: "Income", icon: ArrowDownLeft, active: "text-success" },
  { value: "TRANSFER", label: "Transfer", icon: ArrowLeftRight, active: "text-primary" },
];

export function TypeSwitcher({
  value,
  onChange,
}: {
  value: TransactionType;
  onChange: (t: TransactionType) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Transaction type"
      className="grid grid-cols-3 gap-1 rounded-xl bg-secondary/70 p-1"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              selected
                ? "bg-card shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", selected && opt.active)} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
