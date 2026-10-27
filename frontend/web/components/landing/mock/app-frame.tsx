import { Logo } from "@/components/brand/logo";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

const SHOWN = NAV_ITEMS.filter((i) => i.href !== "/transactions/new" && i.href !== "/settings");

/**
 * MoFin's own window around a mock screen: the real sidebar (same items and
 * icons as components/shell/nav-items.ts) beside the content, not a generic
 * browser frame. Decorative.
 */
export function AppFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid overflow-hidden rounded-hero border border-border bg-background shadow-hero sm:grid-cols-[12.5rem_1fr]",
        className,
      )}
    >
      <aside className="hidden border-r border-sidebar-border bg-sidebar p-4 sm:block">
        <Logo className="scale-90 origin-left" />
        <ul className="mt-6 space-y-0.5">
          {SHOWN.map(({ href, label, icon: Icon, badge }) => {
            const active = href === "/dashboard";
            return (
              <li
                key={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
                  active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-4", active && "text-primary-text")} />
                {label}
                {badge && (
                  <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    1
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
