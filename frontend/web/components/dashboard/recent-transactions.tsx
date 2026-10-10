"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
import Link from "next/link";
import { useRecentTransactions } from "@/hooks/useSearch";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Card } from "@/components/ui/card";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Receipt, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASHBOARD_RECENT_LIMIT } from "@/lib/dashboard-scope";
import type { Account, Transaction } from "@/lib/types";

/** Which account(s) a transaction touched, for lists that span every account. */
function accountLabelFor(tx: Transaction, accounts?: Account[]): string | undefined {
  const name = (id?: string) => accounts?.find((a) => a.id === id)?.name;
  if (tx.type === "TRANSFER") {
    const from = name(tx.items.find((i) => i.direction === "DEBIT")?.accountId);
    const to = name(tx.items.find((i) => i.direction === "CREDIT")?.accountId);
    return from && to ? `${from} → ${to}` : (from ?? to);
  }
  return name(tx.items[0]?.accountId);
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "Today", "Yesterday", else "Monday, Oct 6" (with the year once it isn't this year). */
function dayLabel(iso: string, now: Date): { key: string; label: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { key: iso, label: iso };
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const key = dayKey(d);
  if (key === dayKey(now)) return { key, label: "Today" };
  if (key === dayKey(yesterday)) return { key, label: "Yesterday" };
  const label = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  }).format(d);
  return { key, label };
}

/** Consecutive transactions on the same calendar day, in the order the API returned them. */
function groupByDay(rows: Transaction[], now: Date) {
  const groups: { key: string; label: string; rows: Transaction[] }[] = [];
  for (const tx of rows) {
    const { key, label } = dayLabel(tx.occurredAt, now);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(tx);
    else groups.push({ key, label, rows: [tx] });
  }
  return groups;
}

export function RecentTransactions({ accountId, className }: { accountId?: string; className?: string } = {}) {
  const { data, isLoading, isError, refetch } = useRecentTransactions(DASHBOARD_RECENT_LIMIT, accountId);
  const { data: accounts } = useAccounts();
  const groups = groupByDay(data ?? [], new Date());

  return (
    <Card className={cn("flex flex-col overflow-hidden p-0", className)}>
      <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-5">
        <h2 className="label-sm text-foreground!">Recent transactions</h2>
        <Button asChild variant="ghost" size="sm" className="-mr-2 gap-1 text-xs">
          <Link href="/search">
            View all <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <SkeletonRows rows={6} />
      ) : isError ? (
        <div className="p-4">
          <ErrorState description="Couldn't load recent transactions." onRetry={() => refetch()} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Receipt}
            className="border-0 bg-transparent px-2 py-5"
            title="No transactions yet"
            description="Record your first transaction or describe one in Drafts."
            action={
              accounts && accounts.length === 0 ? (
                <Button asChild>
                  <Link href="/accounts">Create an account first</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/drafts">Try a draft</Link>
                </Button>
              )
            }
          />
        </div>
      ) : (
        // Scrolls inside the card so a long list never stretches the dashboard row; the bottom
        // edge fades out instead of ending on a hard line. Capped on small screens, where the
        // card isn't pinned to a sibling's height.
        <div className="max-h-112 min-h-0 flex-1 overflow-y-auto overscroll-contain mask-[linear-gradient(to_bottom,black_calc(100%-2rem),transparent)] lg:max-h-none">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="sticky top-0 z-10 bg-card/95 px-5 pb-1 pt-3 text-xs font-medium text-muted-foreground backdrop-blur-md">
                {group.label}
              </h3>
              <div>
                {group.rows.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    variant="glance"
                    accountLabel={accountId ? undefined : accountLabelFor(tx, accounts)}
                  />
                ))}
              </div>
            </section>
          ))}
          <div aria-hidden className="h-6" />
        </div>
      )}
    </Card>
  );
}
