import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One section of the Settings page: a card with an icon, a level-2 heading and a
 * short description. The `id` is the anchor the section navigation links to; the
 * card can take focus (`tabIndex -1`) so jumping to it moves the keyboard too, and
 * `scroll-mt` keeps its heading clear of the sticky top bar and section row.
 */
export function SettingsCard({
  id,
  title,
  description,
  icon: Icon,
  action,
  tone = "default",
  className,
  children,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Sits beside the heading, e.g. a link to the page that adds something. */
  action?: React.ReactNode;
  tone?: "default" | "danger";
  className?: string;
  children?: React.ReactNode;
}) {
  const danger = tone === "danger";
  return (
    <Card
      id={id}
      tabIndex={id ? -1 : undefined}
      className={cn(
        "scroll-mt-32 gap-0 p-5 outline-none sm:p-6 lg:scroll-mt-20",
        danger ? "border border-destructive/30 bg-destructive/[0.03]" : "border-0",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        {Icon && (
          <span
            aria-hidden
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              danger ? "bg-destructive/10 text-destructive" : "bg-primary/15 text-primary-text",
            )}
          >
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className={cn("text-base font-semibold leading-tight", danger && "text-destructive")}>{title}</h2>
          {description && <div className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </Card>
  );
}

/** One action inside a settings card: what it does on the left, its button on the right. */
export function SettingsRow({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
