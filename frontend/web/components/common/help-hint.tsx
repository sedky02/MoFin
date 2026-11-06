"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * An explanation that shouldn't take up room on the page: an info icon with a tooltip. A plain
 * tooltip never opens on a touch screen, so a tap opens this one too.
 */
export function HelpHint({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        onClick={(event) => {
          // Without this the trigger's own click handler closes it again.
          event.preventDefault();
          setOpen(true);
        }}
      >
        <Info className="size-4" aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="max-w-60 text-pretty">{children}</TooltipContent>
    </Tooltip>
  );
}
