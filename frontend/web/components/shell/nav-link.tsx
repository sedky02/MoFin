"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";
import { Badge } from "@/components/ui/badge";
import { usePendingDraftCount } from "@/hooks/useDrafts";
import { useViewTransitionRouter } from "@/hooks/use-view-transition-router";

export function NavLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const navigate = useViewTransitionRouter();
  const Icon = item.icon;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Respect new-tab / modifier clicks; otherwise do a View Transition nav.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(item.href);
    onNavigate?.();
  }
  // Dashboard matches exactly; others match the section prefix.
  const active =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={handleClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {/* active rail */}
      <span
        className={cn(
          "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
      <span className="flex-1">{item.label}</span>
      {item.badge === "drafts" && <DraftBadge />}
    </Link>
  );
}

function DraftBadge() {
  const { data: count } = usePendingDraftCount();
  if (!count) return null;
  return (
    <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[11px] tabular text-primary-foreground">
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
