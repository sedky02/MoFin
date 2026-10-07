"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Beyond this many currencies the switch becomes a dropdown.
const MAX_PILLS = 3;

export interface CurrencyOption {
  code: string;
  overdrawn?: boolean;
  /** A currency other than the selected one that has data worth switching to. */
  activity?: boolean;
}

/**
 * Dashboard currency switch (shared by the balance hero and the monthly summary):
 * pills for a few currencies, a dropdown for many. Renders nothing for one.
 */
export function CurrencySwitch({
  currencies,
  value,
  onChange,
}: {
  currencies: CurrencyOption[];
  value: string;
  onChange: (currency: string) => void;
}) {
  if (currencies.length < 2) return null;

  if (currencies.length > MAX_PILLS) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="h-8 w-28 rounded-full tabular" aria-label="Currency">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {currencies.map((c) => (
            <SelectItem key={c.code} value={c.code} className="tabular">
              <span className="flex items-center gap-2">
                {c.code}
                {c.overdrawn && <span className="size-1.5 rounded-full bg-destructive" aria-label="overdrawn" />}
                {c.activity && <span className="size-1.5 rounded-full bg-primary" aria-label="has activity" />}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div role="radiogroup" aria-label="Currency" className="inline-flex rounded-full border border-border p-1">
      {currencies.map((c) => (
        <button
          key={c.code}
          type="button"
          role="radio"
          aria-checked={c.code === value}
          onClick={() => onChange(c.code)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tabular transition-colors",
            c.code === value ? "bg-primary/15 text-primary-text" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {c.code}
          {c.overdrawn && (
            <span className="size-1.5 rounded-full bg-destructive" title="Overdrawn" aria-label="overdrawn" />
          )}
          {c.activity && (
            <span
              className="size-1.5 rounded-full bg-primary"
              title={`${c.code} has activity this month`}
              aria-label="has activity this month"
            />
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Inline currency picker that reads as part of a subtitle ("All accounts · TND ⌄"):
 * text-sized, no border or fill until hovered. A dot marks that another currency has data.
 */
export function CurrencyMenu({
  currencies,
  value,
  onChange,
}: {
  currencies: CurrencyOption[];
  value: string;
  onChange: (currency: string) => void;
}) {
  if (currencies.length < 2) return null;
  const otherHasActivity = currencies.some((c) => c.code !== value && c.activity);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label="Currency"
        className="h-6 gap-1 rounded-md border-0 bg-transparent px-1.5 py-0 text-xs font-medium text-foreground shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted"
      >
        <SelectValue />
        {otherHasActivity && (
          <span className="size-1.5 rounded-full bg-primary" title="Another currency has activity this month" />
        )}
      </SelectTrigger>
      <SelectContent align="start">
        {currencies.map((c) => (
          <SelectItem key={c.code} value={c.code} className="tabular">
            <span className="flex items-center gap-2">
              {c.code}
              {c.activity && <span className="text-xs text-muted-foreground">has activity</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
