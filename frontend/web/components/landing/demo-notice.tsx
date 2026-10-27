"use client";

import { useSearchParams } from "next/navigation";
import { DEMO_NOTICES, parseDemoNotice } from "@/lib/demo";

/** Why the demo didn't start, when the BFF sent the visitor back (?demo=…). */
export function DemoNotice() {
  const notice = parseDemoNotice(useSearchParams().get("demo") ?? undefined);
  if (!notice) return null;
  return (
    <p role="status" className="mt-6 max-w-md rounded-xl border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
      {DEMO_NOTICES[notice]}
    </p>
  );
}
