"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/types";

export function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder = "Select account",
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  id,
  className,
}: {
  accounts: Account[];
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Radix's hidden native <select> can fire an empty or stale change before its option registers,
  // which would blank the account; trust changes only while the user interacts.
  function handleValueChange(id: string) {
    if (!id) return;
    if (!open && document.activeElement !== triggerRef.current) return;
    onChange(id);
  }

  return (
    <Select value={value} onValueChange={handleValueChange} open={open} onOpenChange={setOpen} disabled={disabled}>
      <SelectTrigger
        ref={triggerRef}
        id={id}
        className={cn("w-full", className)}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <span className="flex w-full items-center gap-2">
              <span className="truncate">{a.name}</span>
              <span className="text-xs text-muted-foreground tabular">
                {a.currency}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
