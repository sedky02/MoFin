"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";
import { usePendingDraftCount } from "@/hooks/useDrafts";

const BOTTOM_NAV = NAV_ITEMS.filter((i) =>
  ["/dashboard", "/accounts", "/transactions/new", "/drafts"].includes(i.href),
);

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh border-r border-sidebar-border lg:block">
        <SidebarNav />
      </aside>

      <div className="flex min-h-dvh flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md">
          {/* Mobile: open full nav sheet */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex-1" />
          <span className="mr-1 hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 sm:flex">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            <span className="label-caps text-[10px]! tracking-widest!">Mainnet · Live</span>
          </span>
          <ThemeToggle />
          <UserMenu />
        </header>

        {/* Page content — sidebar nav wraps navigation in a View Transition (see nav-link). */}
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav />
    </div>
  );
}

function MobileBottomNav() {
  const pathname = usePathname();
  const { data: count } = usePendingDraftCount();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-background/90 backdrop-blur-md lg:hidden"
      aria-label="Primary mobile"
    >
      {BOTTOM_NAV.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span className="relative">
              <Icon className="size-5" />
              {item.badge === "drafts" && !!count && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] tabular text-primary-foreground">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
            {item.label.replace(" Transaction", "")}
          </Link>
        );
      })}
    </nav>
  );
}
