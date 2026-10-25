"use client";

import * as React from "react";
import Link from "next/link";
import { Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyAmount } from "@/components/common/money-amount";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { RecurringSeriesActions, SeriesPausedNote } from "@/components/transactions/recurring-panel";
import { useAccounts } from "@/hooks/useAccounts";
import { useSearchPage, type SearchParams } from "@/hooks/useSearch";
import { multiply } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import {
  seriesAccountLabel,
  seriesAmount,
  seriesIntervalLabel,
  seriesIsActive,
  seriesIsOpen,
  seriesNextOccurrence,
  seriesPausedLabel,
} from "@/lib/recurring-series";
import type { Account, Transaction } from "@/lib/types";

// Each series once, by its root (deleted roots never come back): active ones
// first by their next date, then paused, then cancelled.
const SERIES_QUERY: SearchParams = { recurrence: "series", sort: "next-occurrence" };
const PAGE_SIZE = 25;

/** The Recurring view of /transactions: every recurring series, with its schedule and actions. */
export function RecurringSeriesList() {
  const [page, setPage] = React.useState(1);
  // Archived accounts too, so a series on one still names it.
  const { data: accounts } = useAccounts("all");
  const { data, isLoading, isFetching, isError, refetch } = useSearchPage(SERIES_QUERY, page, PAGE_SIZE);

  const rows = data?.rows ?? [];
  const accountsById = accounts ? new Map(accounts.map((a) => [a.id, a])) : undefined;

  if (isLoading) return <SkeletonRows rows={4} />;
  if (isError) return <ErrorState description="Couldn't load recurring transactions." onRetry={() => refetch()} />;
  if (rows.length === 0 && page === 1) {
    return (
      <EmptyState
        icon={Repeat}
        title="No recurring transactions"
        description="Turn on “Repeat this transaction” when you record one, and its series shows up here."
        action={
          <Button asChild variant="outline">
            <Link href="/transactions/new">New transaction</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-0 p-0 shadow-sm">
        <ul className="divide-y divide-border" aria-label="Recurring series">
          {rows.map((tx) => (
            <SeriesRow key={tx.id} tx={tx} accountsById={accountsById} />
          ))}
        </ul>
      </Card>

      <div className="flex items-center justify-between">
        <p role="status" className="text-xs text-muted-foreground tabular">
          Page {page}
          {data && ` · ${data.total} series`}
          {isFetching && " · updating…"}
        </p>
        {(page > 1 || data?.hasNext) && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!data?.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SeriesRow({ tx, accountsById }: { tx: Transaction; accountsById?: ReadonlyMap<string, Account> }) {
  const active = seriesIsActive(tx);
  const open = seriesIsOpen(tx);
  const next = seriesNextOccurrence(tx);
  const pausedLabel = seriesPausedLabel(tx);
  const accountLabel = seriesAccountLabel(tx, accountsById);
  const amount = seriesAmount(tx);

  return (
    // Phone: name and amount on top, the actions below. From sm up: name, amount, actions in a row.
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 bg-card px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0">
        <Link
          href={`/transactions/${tx.id}`}
          className="block truncate rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tx.description}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge variant={active ? "secondary" : "outline"} className="gap-1">
            <Repeat className="size-3" aria-hidden="true" />
            {seriesIntervalLabel(tx)}
            {open ? "" : " · Cancelled"}
          </Badge>
          {next && <span className="tabular">Next on {formatDate(next)}</span>}
          {pausedLabel && <SeriesPausedNote label={pausedLabel} />}
          {open && tx.recurringEndDate && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">Ends {formatDate(tx.recurringEndDate)}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="min-w-0 truncate">
            {accountLabel ?? (
              <>
                <Skeleton className="inline-block h-3 w-20 align-middle" aria-hidden="true" />
                <span className="sr-only">Loading account</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* What each coming occurrence posts (the template, which an edit can change). */}
      <MoneyAmount
        amount={tx.type === "EXPENSE" ? multiply(amount, "-1") : amount}
        currency={tx.currency}
        colorBySign={tx.type !== "TRANSFER"}
        className="text-right text-sm font-semibold"
      />
      {open && <RecurringSeriesActions tx={tx} className="col-span-2 sm:col-span-1 sm:justify-end" />}
    </li>
  );
}
