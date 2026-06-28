"use client";

import Link from "next/link";
import { useRecentTransactions } from "@/hooks/useSearch";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Card } from "@/components/ui/card";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Receipt, ArrowRight } from "lucide-react";

export function RecentTransactions() {
  const { data, isLoading, isError, refetch } = useRecentTransactions(10);

  return (
    <Card className="glass-panel overflow-hidden border-0 p-0 ring-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <h2 className="label-caps text-foreground!">Activity Stream</h2>
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
            title="No transactions yet"
            description="Record your first transaction or describe one in Drafts."
            action={
              <Button asChild>
                <Link href="/drafts">Try a draft</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {data.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </Card>
  );
}
