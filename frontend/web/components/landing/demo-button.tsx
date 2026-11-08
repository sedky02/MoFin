"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A plain form POST, so it works before or without JavaScript; the BFF route redirects to the
 * dashboard, and seeding takes a moment, so the button says so.
 */
export function DemoButton({
  className,
  size = "hero",
  onBrand = false,
}: {
  className?: string;
  size?: "hero" | "nav" | "quiet";
  onBrand?: boolean;
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <form
      action="/api/demo"
      method="post"
      onSubmit={() => setPending(true)}
      className={cn(size === "hero" && "w-full sm:w-auto", size === "quiet" && "w-full", className)}
    >
      <Button
        type="submit"
        disabled={pending}
        variant={size === "quiet" ? "ghost" : "default"}
        className={cn(
          size === "hero" && "h-12 w-full rounded-xl px-6 text-base sm:w-auto",
          size === "nav" && "h-9 px-3.5",
          size === "quiet" && "h-11 w-full gap-2 rounded-[14px] text-[15px] font-semibold text-muted-foreground",
          onBrand &&
            "bg-primary-foreground text-primary hover:bg-primary-foreground/85 focus-visible:border-primary-foreground focus-visible:ring-primary-foreground/60",
        )}
      >
        {/* Both labels share one cell, so the button keeps the wider one's width and nothing beside it moves. */}
        <span className="grid">
          <span className={cn("inline-flex items-center justify-center gap-2 [grid-area:1/1]", pending && "invisible")}>
            {size === "quiet" && <Sparkles className="size-4" aria-hidden />}
            Try the demo
          </span>
          <span
            className={cn("inline-flex items-center justify-center gap-2 [grid-area:1/1]", !pending && "invisible")}
            aria-hidden={!pending}
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {size === "hero" || size === "quiet" ? "Setting up your demo…" : "Starting…"}
          </span>
        </span>
      </Button>
    </form>
  );
}
