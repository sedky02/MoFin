"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

/** Light/dark choice. Applies at once and is kept on this device, so it isn't part of the Save bar. */
export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <p id="theme-label" className="text-sm font-medium leading-none">
        Appearance
      </p>
      <div role="group" aria-labelledby="theme-label" className="mt-2 inline-flex rounded-lg bg-muted p-1">
        {OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              theme === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Applies right away, on this device.</p>
    </div>
  );
}
