"use client";

import * as React from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Try the demo": a plain form POST, so it works before (or without)
 * JavaScript. The BFF route gives the visitor their own temporary demo and
 * redirects to the dashboard; seeding takes a moment, so the button says so.
 */
export function DemoButton({ className, size = "hero" }: { className?: string; size?: "hero" | "nav" }) {
  const [pending, setPending] = React.useState(false);
  return (
    <form action="/api/demo" method="post" onSubmit={() => setPending(true)} className={className}>
      <Button
        type="submit"
        disabled={pending}
        className={cn(size === "hero" ? "h-12 gap-2 rounded-xl px-6 text-base" : "h-9 gap-1.5 px-3.5")}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Setting up your demo…
          </>
        ) : (
          <>
            Try the demo
            {size === "hero" && <ArrowRight className="size-4" aria-hidden />}
          </>
        )}
      </Button>
    </form>
  );
}
