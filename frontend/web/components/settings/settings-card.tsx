import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One section of the Settings page: a card with a level-2 heading and a short
 * description. The `id` is the anchor the section navigation links to, and
 * `scroll-mt` keeps the heading clear of the sticky top bar when it lands.
 */
export function SettingsCard({
  id,
  title,
  description,
  action,
  tone = "default",
  className,
  children,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  /** Sits beside the heading, e.g. a link to the page that adds something. */
  action?: React.ReactNode;
  tone?: "default" | "danger";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card
      id={id}
      className={cn(
        "scroll-mt-20 gap-0 p-5 sm:p-6",
        tone === "danger" ? "border border-destructive/30" : "border-0",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className={cn("text-base font-semibold leading-tight", tone === "danger" && "text-destructive")}>
            {title}
          </h2>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </Card>
  );
}
