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
  { value: "TRANSFER", label: "Transfer", icon: ArrowLeftRight, active: "text-primary-text" },
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
      role="radiogroup"
      aria-label="Transaction type"
      onKeyDown={(e) => {
        const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const i = OPTIONS.findIndex((o) => o.value === value);
        const next = OPTIONS[(i + dir + OPTIONS.length) % OPTIONS.length];
        onChange(next.value);
        e.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
      }}
      className="grid grid-cols-3 gap-1 rounded-xl bg-secondary/70 p-1"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            role="radio"
            type="button"
            data-value={opt.value}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
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
