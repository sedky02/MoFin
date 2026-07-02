"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTransaction } from "@/hooks/useTransactions";
import { MoneyAmount } from "@/components/common/money-amount";
import { TypeBadge } from "@/components/common/badges";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, transactionAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TransactionDetail({ id }: { id: string }) {
  const { data: tx, isLoading, isError, refetch } = useTransaction(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !tx) {
    return (
      <ErrorState
        title="Transaction not found"
        description="This transaction may have been removed or never existed."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground">
        <Link href="/search">
          <ArrowLeft className="size-4" />
          Back to transactions
        </Link>
      </Button>

      {/* Summary */}
      <Card className="border-0 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <TypeBadge type={tx.type} />
            <h1 className="mt-3 text-balance text-xl font-semibold">{tx.description}</h1>
            <p className="mt-1 text-sm text-muted-foreground tabular">
              {formatDateTime(tx.occurredAt)}
            </p>
          </div>
          <MoneyAmount
            amount={tx.type === "EXPENSE" ? `-${transactionAmount(tx)}` : transactionAmount(tx)}
            currency={tx.currency}
            colorBySign={tx.type !== "TRANSFER"}
            className="shrink-0 text-2xl font-semibold"
          />
        </div>

        {tx.category && (
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">Category</span>
            <span className="flex items-center gap-1.5 font-medium">
              {tx.category.icon && <span>{tx.category.icon}</span>}
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: tx.category.color || "var(--muted-foreground)" }}
              />
              {tx.category.name}
            </span>
          </div>
        )}
      </Card>

      {/* Double-entry ledger items */}
      <Card className="mt-6 overflow-hidden border-0 p-0 shadow-sm">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Ledger entries</h2>
          <p className="text-xs text-muted-foreground">Double-entry record for this transaction.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tx.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                  No ledger entries recorded.
                </TableCell>
              </TableRow>
            ) : (
              tx.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.account?.name ?? item.accountId}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                        item.direction === "DEBIT"
                          ? "bg-success/12 text-success"
                          : "bg-destructive/12 text-destructive",
                      )}
                    >
                      {item.direction === "DEBIT" ? "Debit" : "Credit"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyAmount
                      amount={item.amount}
                      currency={item.currency}
                      className="font-medium"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
