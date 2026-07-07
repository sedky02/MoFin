"use client";

import { Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account } from "@/lib/types";

const ALL = "all";

/** undefined value/onChange argument means "All accounts" (aggregate view). */
export function AccountSwitcher({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value?: string;
  onChange: (accountId?: string) => void;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="w-full sm:w-56" aria-label="Filter dashboard by account">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>
          <span className="flex items-center gap-2">
            <Layers className="size-3.5" />
            All accounts
          </span>
        </SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <span className="flex w-full items-center gap-2">
              <span className="truncate">{a.name}</span>
              <span className="text-xs text-muted-foreground tabular">{a.currency}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
