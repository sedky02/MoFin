"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, Ellipsis } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { DemoBanner } from "./demo-banner";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { BOTTOM_NAV_ITEMS, isNavActive } from "./nav-items";
import { cn } from "@/lib/utils";

/** The account new transactions, drafts and goals default to. "All accounts" = no default. */
function ActiveAccountPicker() {
  const { accountId, setAccountId, accounts } = useActiveAccount();
  if (accounts.length === 0) return null;
  return (
    <AccountSwitcher
      accounts={accounts}
      value={accountId}
      onChange={setAccountId}
      label="Active account (pre-fills forms)"
      className="h-9 w-36 sm:w-52"
    />
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {/* Desktop sidebar. usePathname/usePendingDraftCount inside SidebarNav read
          per-request data, so this subtree needs its own Suspense boundary to keep
          the rest of the route shell statically prerenderable. */}
      <aside className="sticky top-0 hidden h-dvh border-r border-sidebar-border lg:block">
        <Suspense fallback={<SidebarNavSkeleton />}>
          <SidebarNav />
        </Suspense>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <DemoBanner />
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
              <Suspense fallback={<SidebarNavSkeleton />}>
                <SidebarNav onNavigate={() => setOpen(false)} />
              </Suspense>
            </SheetContent>
          </Sheet>

          <div className="flex-1" />
          <ActiveAccountPicker />
          <ThemeToggle />
          <UserMenu />
        </header>

        {/* Page content — sidebar nav wraps navigation in a View Transition (see nav-link). */}
        <main id="main" tabIndex={-1} className="flex-1 outline-none px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <Suspense fallback={<MobileBottomNavSkeleton />}>
        <MobileBottomNav menuOpen={open} onOpenMenu={() => setOpen(true)} />
      </Suspense>
    </div>
  );
}

function SidebarNavSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 bg-sidebar px-3 py-4">
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="flex flex-1 flex-col gap-2 pt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function MobileBottomNavSkeleton() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 h-16 border-t border-border bg-background/90 backdrop-blur-md lg:hidden"
      aria-hidden
    />
  );
}

const BAR_ITEM =
  "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function MobileBottomNav({ menuOpen, onOpenMenu }: { menuOpen: boolean; onOpenMenu: () => void }) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-background/90 backdrop-blur-md lg:hidden"
      aria-label="Primary mobile"
    >
      {BOTTOM_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(BAR_ITEM, active ? "text-primary-text" : "text-muted-foreground")}
          >
            <Icon className="size-5" />
            {item.barLabel ?? (item.label === "New Transaction" ? "Add" : item.label)}
          </Link>
        );
      })}
      {/* Opens the same sheet as the topbar hamburger. */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
        className={cn(BAR_ITEM, "text-muted-foreground")}
      >
        <Ellipsis className="size-5" />
        More
      </button>
    </nav>
  );
}
