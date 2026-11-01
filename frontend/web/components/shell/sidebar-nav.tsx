"use client";

import Link from "next/link";
import { ChevronsLeft, ChevronsRight, PlusCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SIDEBAR_FOOTER_ITEM, SIDEBAR_GROUPS } from "./nav-items";
import { NavLink } from "./nav-link";
import { SidebarAccount } from "./sidebar-account";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Shared nav body used by both the desktop rail and the mobile sheet. On the desktop rail it can
 * shrink to an icon-only strip; the sheet is always full.
 */
export function SidebarNav({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  /** Present on the desktop rail only: shows the collapse button next to the logo. */
  onToggleCollapsed?: () => void;
}) {
  return (
    <div className={cn("flex h-full flex-col gap-2 bg-sidebar py-4", collapsed ? "px-2" : "px-3")}>
      <div className={cn("flex py-2", collapsed ? "flex-col items-center gap-3" : "items-center justify-between gap-2 px-2")}>
        <Link href="/dashboard" onClick={onNavigate} aria-label="MoFin home">
          <Logo showText={!collapsed} />
        </Link>
        {onToggleCollapsed && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </Button>
        )}
      </div>

      <div className={cn("py-2", collapsed ? "flex justify-center" : "px-1")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild size="icon" className="size-11">
                <Link href="/transactions/new" onClick={onNavigate} aria-label="New transaction">
                  <PlusCircle className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              New transaction <kbd className="rounded bg-background/20 px-1 text-[11px]">N</kbd>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button asChild className="h-11 w-full justify-start gap-2.5">
            <Link href="/transactions/new" onClick={onNavigate}>
              <PlusCircle className="size-4" />
              New transaction
              {/* The N key does the same; there's no keyboard on a touch screen to press it. */}
              <kbd
                aria-hidden
                className="ml-auto rounded bg-primary-foreground/15 px-1.5 text-[11px] font-medium pointer-coarse:hidden"
              >
                N
              </kbd>
            </Link>
          </Button>
        )}
      </div>

      <nav className={cn("flex flex-1 flex-col overflow-y-auto overscroll-contain", collapsed ? "gap-2" : "gap-5")} aria-label="Primary">
        {SIDEBAR_GROUPS.map((group, i) => (
          <div key={group.label ?? i} role="group" aria-label={group.label} className="flex flex-col gap-0.5">
            {group.label &&
              (collapsed ? (
                // The names give way to a thin divider line when there is only room for icons.
                <hr aria-hidden className="mx-2 mb-1.5 border-sidebar-border" />
              ) : (
                <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
              ))}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings is pinned to the bottom, and under it who is signed in, with Sign out. */}
      <div className="flex flex-col gap-3">
        <NavLink item={SIDEBAR_FOOTER_ITEM} onNavigate={onNavigate} collapsed={collapsed} />
        <SidebarAccount collapsed={collapsed} />
      </div>
    </div>
  );
}
