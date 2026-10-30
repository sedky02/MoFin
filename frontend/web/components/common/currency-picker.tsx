"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENCIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const EXTRA_NAMES: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum" };

let displayNames: Intl.DisplayNames | undefined;
/** "USD" → "US Dollar". Falls back to the code where the runtime has no name. */
function currencyName(code: string): string {
  if (EXTRA_NAMES[code]) return EXTRA_NAMES[code];
  try {
    displayNames ??= new Intl.DisplayNames(["en"], { type: "currency" });
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

type Option = { code: string; name: string; group?: string };

/**
 * A currency field with a search box. Matches the code or the name, so "euro" and "eur" both find EUR.
 * Currencies already in use come first while the search is empty.
 */
export const CurrencyPicker = React.forwardRef<
  HTMLButtonElement,
  {
    value: string;
    onChange: (code: string) => void;
    /** Codes to list first, under "In use". */
    pinned?: string[];
    disabled?: boolean;
    id?: string;
  } & Omit<React.ComponentProps<"button">, "value" | "onChange" | "id" | "disabled">
>(function CurrencyPicker({ value, onChange, pinned = [], disabled, id, className, ...rest }, ref) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const options = React.useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const all = CURRENCIES.map((code) => ({ code, name: currencyName(code) }));
    if (q) {
      const hits = all.filter((o) => o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q));
      // A code that starts with the query reads as the intended one, so it goes first.
      return hits.sort(
        (a, b) =>
          Number(b.code.toLowerCase().startsWith(q)) - Number(a.code.toLowerCase().startsWith(q)),
      );
    }
    const pin = new Set(pinned);
    return [
      ...all.filter((o) => pin.has(o.code)).map((o) => ({ ...o, group: "In use" })),
      ...all.filter((o) => !pin.has(o.code)).map((o) => ({ ...o, group: pin.size ? "All currencies" : undefined })),
    ];
  }, [query, pinned]);

  // Start on the current value when opening, and back at the top whenever the search changes.
  React.useEffect(() => {
    if (!open) return;
    const i = options.findIndex((o) => o.code === value);
    setActive(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(code: string) {
    onChange(code);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[active]) pick(options[active].code);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={ref}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          disabled={disabled}
          // Same look as the other fields (Input), so it doesn't stand out in the form.
          className={cn(
            "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-base transition-colors outline-none pointer-coarse:h-11 md:text-sm",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring aria-expanded:border-ring",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80",
            className,
          )}
          {...rest}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="tabular font-medium">{value}</span>
            <span className="truncate text-muted-foreground">{currencyName(value)}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 gap-0 p-0"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="relative border-b">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search by code or name"
            aria-label="Search currencies"
            role="searchbox"
            aria-controls={listId}
            aria-activedescendant={options[active] ? `${listId}-${options[active].code}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} id={listId} role="listbox" aria-label="Currencies" className="max-h-60 overflow-y-auto p-1">
          {options.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No currency matches &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            options.map((o, i) => (
              <React.Fragment key={`${o.group}-${o.code}`}>
                {o.group && o.group !== options[i - 1]?.group && (
                  <div className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{o.group}</div>
                )}
                <div
                  id={`${listId}-${o.code}`}
                  data-index={i}
                  role="option"
                  aria-selected={o.code === value}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(o.code)}
                  className={cn(
                    "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                    i === active && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="tabular w-10 shrink-0 font-medium">{o.code}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.name}</span>
                  {o.code === value && <Check className="size-4 shrink-0" aria-hidden />}
                </div>
              </React.Fragment>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
