"use client";

import { TYPE_ICON } from "@/components/accounts/account-card";
import { ACCOUNT_TYPES } from "@/lib/constants";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The four account types as tappable tiles, the chosen one ringed. */
export function AccountTypePicker({
  value,
  onChange,
  label = "Type",
}: {
  value: AccountType;
  onChange: (type: AccountType) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-4 gap-2">
      {ACCOUNT_TYPES.map((t) => {
        const Icon = TYPE_ICON[t.value];
        const selected = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(t.value)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg bg-card px-2 py-2.5 text-xs font-medium transition-shadow",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "text-foreground ring-2 ring-primary"
                : "text-muted-foreground ring-1 ring-border hover:text-foreground hover:ring-foreground/30",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
