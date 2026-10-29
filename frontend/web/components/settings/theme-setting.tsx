"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun, page: "bg-[#fafaf9]", card: "bg-white", line: "bg-[#d4d4d4]" },
  { value: "dark", label: "Dark", Icon: Moon, page: "bg-[#050505]", card: "bg-[#1c1b1b]", line: "bg-[#55585a]" },
] as const;

/** Light/dark choice with a small preview of each. Applies at once and is kept on this device, so it isn't part of the Save bar. */
export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <p id="theme-label" className="text-sm font-medium leading-none">
        Appearance
      </p>
      <div role="group" aria-labelledby="theme-label" className="mt-3 grid max-w-sm grid-cols-2 gap-3">
        {OPTIONS.map(({ value, label, Icon, page, card, line }) => {
          const selected = theme === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => setTheme(value)}
              className={cn(
                "group rounded-xl border-2 p-1.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                selected ? "border-primary" : "border-border hover:border-muted-foreground/40",
              )}
            >
              <span aria-hidden className={cn("block rounded-lg p-2", page)}>
                <span className={cn("block space-y-1.5 rounded-md p-2 shadow-sm", card)}>
                  <span className={cn("block h-1.5 w-1/2 rounded-full", line)} />
                  <span className={cn("block h-1.5 w-3/4 rounded-full opacity-60", line)} />
                  <span className="block h-1.5 w-1/3 rounded-full bg-[#a3e635]" />
                </span>
              </span>
              <span className="mt-2 flex items-center gap-1.5 px-1 pb-0.5 text-sm font-medium">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {label}
                {selected && <Check className="ml-auto size-4 text-primary-text" aria-hidden />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Applies right away, on this device.</p>
    </div>
  );
}
