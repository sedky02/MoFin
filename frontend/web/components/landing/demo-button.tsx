"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Try the demo": a plain form POST, so it works before (or without)
 * JavaScript. The BFF route gives the visitor their own temporary demo and
 * redirects to the dashboard; seeding takes a moment, so the button says so.
 * `onBrand` is the ink version for the lime band at the end of the page.
 */
export function DemoButton({
  className,
  size = "hero",
  onBrand = false,
}: {
  className?: string;
  size?: "hero" | "nav";
  onBrand?: boolean;
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <form
      action="/api/demo"
      method="post"
      onSubmit={() => setPending(true)}
      // Full width on phones, like the buttons stacked beside it.
      className={cn(size === "hero" && "w-full sm:w-auto", className)}
    >
      <Button
        type="submit"
        disabled={pending}
        className={cn(
          size === "hero" ? "h-12 w-full rounded-xl px-6 text-base sm:w-auto" : "h-9 px-3.5",
          onBrand &&
            "bg-primary-foreground text-primary hover:bg-primary-foreground/85 focus-visible:border-primary-foreground focus-visible:ring-primary-foreground/60",
        )}
      >
        {/* Both labels share one cell, so the button keeps the wider one's width and nothing beside it moves. */}
        <span className="grid">
          <span className={cn("[grid-area:1/1]", pending && "invisible")}>Try the demo</span>
          <span
            className={cn("inline-flex items-center justify-center gap-2 [grid-area:1/1]", !pending && "invisible")}
            aria-hidden={!pending}
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {size === "hero" ? "Setting up your demo…" : "Starting…"}
          </span>
        </span>
      </Button>
    </form>
  );
}
