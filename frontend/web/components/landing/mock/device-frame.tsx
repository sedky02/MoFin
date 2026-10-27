import { cn } from "@/lib/utils";

/** A quiet browser window around a mock screen. Decorative. */
export function DeviceFrame({
  children,
  url = "mofin.app/dashboard",
  className,
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("overflow-hidden rounded-hero border border-border bg-card shadow-hero", className)}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="mx-auto rounded-md bg-muted px-3 py-0.5 font-mono text-[11px] text-muted-foreground">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}
