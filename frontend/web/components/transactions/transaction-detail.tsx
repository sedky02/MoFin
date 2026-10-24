"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiClientError } from "@/lib/api";
import { ArrowDown, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useAccounts } from "@/hooks/useAccounts";
import { useDeleteTransaction, useTransaction } from "@/hooks/useTransactions";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { MoneyAmount } from "@/components/common/money-amount";
import { TypeBadge } from "@/components/common/badges";
import { RecurringPanel } from "@/components/transactions/recurring-panel";
import { Badge } from "@/components/ui/badge";
import { Repeat } from "lucide-react";
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
import { ledgerAccountName, transactionAccountLegs } from "@/lib/transaction-accounts";
import type { Account } from "@/lib/types";

export function TransactionDetail({ id }: { id: string }) {
  const router = useRouter();
  // After a delete the page goes back to the list; Undo in the toast brings the user back here.
  const deleteMut = useDeleteTransaction({ onUndone: (undoneId) => router.push(`/transactions/${undoneId}`) });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const { data: tx, isLoading, isError, error, refetch } = useTransaction(id);

  // Older responses carried legs without their account. Only then fall back
  // to the account list, with archived accounts included so they resolve too.
  const needsAccountLookup = !!tx?.items.some((item) => !item.account);
  const accountsQuery = useAccounts("all", needsAccountLookup);
  const accountsById = React.useMemo<ReadonlyMap<string, Account> | undefined>(() => {
    if (accountsQuery.data) return new Map(accountsQuery.data.map((a) => [a.id, a]));
    // A failed lookup resolves to "Deleted account" rather than a spinner forever.
    return accountsQuery.isError ? new Map() : undefined;
  }, [accountsQuery.data, accountsQuery.isError]);

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
    const notFound = !isError || (error instanceof ApiClientError && error.status === 404);
    return notFound ? (
      <ErrorState
        title="Transaction not found"
        description="This transaction may have been removed or never existed."
      />
    ) : (
      <ErrorState description="Couldn't load this transaction." onRetry={() => refetch()} />
    );
  }

  const legs = transactionAccountLegs(tx);
  const nameOf = (item: (typeof tx.items)[number] | undefined) =>
    item ? (ledgerAccountName(item, accountsById) ?? <AccountNamePlaceholder />) : null;
  const singleAccountLeg = legs.from ?? legs.to;

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground">
        <Link
          href="/transactions"
          onClick={(e) => {
            if (window.history.length > 1) {
              e.preventDefault();
              router.back();
            }
          }}
        >
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

        <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
          {tx.type === "TRANSFER" && (
            <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-3">
              <AccountTile label="From" name={nameOf(legs.from)} />
              <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
              <ArrowDown className="mx-auto size-4 text-muted-foreground sm:hidden" aria-hidden="true" />
              <AccountTile label="To" name={nameOf(legs.to)} />
            </div>
          )}
          {(tx.type !== "TRANSFER" && singleAccountLeg) || (tx.category && tx.items.length <= 1) ? (
            <dl className="space-y-2">
              {tx.type !== "TRANSFER" && singleAccountLeg && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <dt className="text-muted-foreground">Account</dt>
                  <dd className="font-medium">{nameOf(singleAccountLeg)}</dd>
                </div>
              )}
              {tx.category && tx.items.length <= 1 && (
                <div className="flex items-center gap-2">
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="flex items-center gap-1.5 font-medium">
                    {tx.category.icon && <span>{tx.category.icon}</span>}
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: tx.category.color || "var(--muted-foreground)" }}
                    />
                    {tx.category.name}
                  </dd>
                </div>
              )}
            </dl>
          ) : null}
        </div>

        {/* It's the user's own record: change it or remove it. */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/transactions/${tx.id}/edit`}>
              <Pencil className="size-4" />
              Edit
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMut.isPending}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>

        {/* Recurring series management — only on the root of a series. */}
        {tx.isRecurring && !tx.parentTransactionId && <RecurringPanel tx={tx} />}

        {/* Generated occurrences just link back to the series they belong to. */}
        {tx.parentTransactionId && (
          <div className="mt-4 border-t border-border pt-4">
            <Badge asChild variant="outline" className="h-6 gap-1">
              <Link href={`/transactions/${tx.parentTransactionId}`}>
                <Repeat className="size-3" />
                Generated from a recurring series
                <ChevronRight className="size-3" aria-hidden="true" />
              </Link>
            </Badge>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this transaction?"
        description={
          tx.isRecurring && !tx.parentTransactionId
            ? "It's removed from your balances, summaries and goals, and the recurring series stops. Transactions the series already created stay. You can undo this right after."
            : "It's removed from your balances, summaries and goals. You can undo this right after."
        }
        confirmLabel="Delete transaction"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMut.mutate(tx.id, { onSuccess: () => router.push("/transactions") });
        }}
      />

      {/* Ledger legs: one per account the money moved out of or into */}
      <Card className="mt-6 overflow-hidden border-0 p-0 shadow-sm">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Ledger entries</h2>
          <p className="text-xs text-muted-foreground">
            {tx.type === "TRANSFER"
              ? "Money out of one account and into the other."
              : "How this transaction changed your account balance."}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Account</TableHead>
              <TableHead>Direction</TableHead>
              {tx.items.length > 1 && <TableHead>Category</TableHead>}
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tx.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={tx.items.length > 1 ? 4 : 3}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  No ledger entries recorded.
                </TableCell>
              </TableRow>
            ) : (
              tx.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium whitespace-normal">{nameOf(item)}</TableCell>
                  <TableCell>
                    {/* DEBIT = out of the account, CREDIT = into it. Neutral on purpose:
                        a transfer's "out" leg is not a loss. */}
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {item.direction === "DEBIT" ? (
                        <>
                          <ArrowUpRight className="size-3" aria-hidden="true" />
                          Out
                        </>
                      ) : (
                        <>
                          <ArrowDownLeft className="size-3" aria-hidden="true" />
                          In
                        </>
                      )}
                    </span>
                  </TableCell>
                  {tx.items.length > 1 && (
                    <TableCell className="whitespace-normal">
                      {item.category ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          {item.category.icon && <span>{item.category.icon}</span>}
                          <span
                            className="size-2 rounded-full"
                            style={{
                              backgroundColor: item.category.color || "var(--muted-foreground)",
                            }}
                          />
                          {item.category.name}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Uncategorized</span>
                      )}
                      {item.memo && item.memo !== tx.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.memo}</p>
                      )}
                    </TableCell>
                  )}
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

function AccountNamePlaceholder() {
  return (
    <>
      <Skeleton className="inline-block h-4 w-24 align-middle" aria-hidden="true" />
      <span className="sr-only">Loading account</span>
    </>
  );
}

/** One end of a transfer: a small label over the account name. */
function AccountTile({ label, name }: { label: string; name: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium break-words">{name}</p>
    </div>
  );
}
