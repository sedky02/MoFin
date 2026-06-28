"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { NAV_ITEMS } from "./nav-items";
import { NavLink } from "./nav-link";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";

/** Shared nav body used by both the desktop rail and the mobile sheet. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-2 bg-sidebar px-3 py-4">
      <div className="px-2 py-2">
        <Link href="/dashboard" onClick={onNavigate} aria-label="MoFin home">
          <Logo />
        </Link>
        <p className="label-caps mt-1.5 pl-0.5">Terminal Active</p>
      </div>

      <div className="px-1 py-2">
        <Button asChild className="w-full justify-start gap-2 font-mono uppercase tracking-wide">
          <Link href="/transactions/new" onClick={onNavigate}>
            <PlusCircle className="size-4" />
            New transaction
          </Link>
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5" aria-label="Primary">
        {NAV_ITEMS.filter((i) => i.href !== "/transactions/new").map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
        <p className="tabular">Ledger-first · balances always exact</p>
      </div>
    </div>
  );
}
