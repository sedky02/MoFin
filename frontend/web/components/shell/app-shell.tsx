"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";
import { usePendingDraftCount } from "@/hooks/useDrafts";

const BOTTOM_NAV = NAV_ITEMS.filter((i) =>
  ["/dashboard", "/accounts", "/transactions/new", "/drafts"].includes(i.href),
);

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
        <MobileBottomNav />
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
              active ? "text-primary-text" : "text-muted-foreground",
            )}
          >
            <span className="relative">
              <Icon className="size-5" />
              {item.badge === "drafts" && !!count && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] tabular text-primary-foreground">
                  {count > 9 ? "9+" : count}
                  <span className="sr-only"> pending</span>
                </span>
              )}
            </span>
            {item.label === "New Transaction" ? "Add" : item.label.replace(" Transaction", "")}
          </Link>
        );
      })}
    </nav>
  );
}
