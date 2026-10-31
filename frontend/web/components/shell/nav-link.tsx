"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavActive, type NavItem } from "./nav-items";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePendingDraftCount } from "@/hooks/useDrafts";
import { useViewTransitionRouter } from "@/hooks/use-view-transition-router";

export function NavLink({
  item,
  onNavigate,
  collapsed = false,
}: {
  item: NavItem;
  onNavigate?: () => void;
  /** Icon only, with the label in a tooltip. */
  collapsed?: boolean;
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
  const active = isNavActive(pathname, item.href);

  const link = (
    <Link
      href={item.href}
      onClick={handleClick}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:py-2.5 lg:text-base",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        collapsed && "mx-auto size-10 justify-center px-0 py-0",
        // The current page is a soft pill; no lime rail.
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0 lg:size-5" />
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {item.badge === "drafts" && <DraftBadge compact={collapsed} />}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

function DraftBadge({ compact }: { compact: boolean }) {
  const { data: count } = usePendingDraftCount();
  if (!count) return null;
  if (compact) {
    // No room for a number in the icon strip: a dot, with the count for screen readers.
    return (
      <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-sidebar">
        <span className="sr-only">{count} pending</span>
      </span>
    );
  }
  return (
    <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[11px] tabular text-primary-foreground">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> pending</span>
    </Badge>
  );
}
