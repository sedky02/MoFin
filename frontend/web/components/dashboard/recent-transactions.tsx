"use client";

import { useAccounts } from "@/hooks/useAccounts";
import Link from "next/link";
import { useRecentTransactions } from "@/hooks/useSearch";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Card } from "@/components/ui/card";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Receipt, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
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

const RECENT_LIMIT = 15;

export function RecentTransactions({ accountId, className }: { accountId?: string; className?: string } = {}) {
  const { data, isLoading, isError, refetch } = useRecentTransactions(RECENT_LIMIT, accountId);
  const { data: accounts } = useAccounts();

  return (
    <Card className={cn("glass-panel flex flex-col overflow-hidden border-0 p-0 ring-0", className)}>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3.5">
        <h2 className="label-caps text-foreground!">Recent Transactions</h2>
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
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
        // Scrolls inside the card so a long list never stretches the dashboard row.
        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
          {data.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} accountLabel={accountId ? undefined : accountLabelFor(tx, accounts)} />
          ))}
        </div>
      )}
    </Card>
  );
}
