"use client";

import Link from "next/link";
import { Plug, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** One quiet line on the dashboard, after setup: the AI assistants are what sets MoFin apart. */
export function AssistantNudge({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="region"
      aria-label="Connect an assistant"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-card py-2 pl-4 pr-2 shadow-surface"
    >
      <Plug aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 basis-56 text-sm">Connect Claude or ChatGPT to log and ask about your money in a chat.</p>
      <Button asChild variant="outline" size="sm">
        <Link href="/connect">Connect</Link>
      </Button>
      <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={onClose} aria-label="Dismiss this suggestion">
        <X aria-hidden />
      </Button>
    </div>
  );
}
