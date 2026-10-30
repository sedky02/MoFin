import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** A titled group of goal rows: one panel with thin dividers between the rows. */
export function GoalPanel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-3 px-1 text-sm font-semibold text-muted-foreground">
        {title}
      </h2>
      <Card className="gap-0 border-0 py-0 shadow-sm">
        <ul className="divide-y divide-border">{children}</ul>
      </Card>
    </section>
  );
}
