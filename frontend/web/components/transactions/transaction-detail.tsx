"use client";

import { CategoryGlyph } from "@/components/categories/category-glyph";
import { CategoryAvatar } from "@/components/categories/category-avatar";
import { HelpHint } from "@/components/common/help-hint";
import { cn } from "@/lib/utils";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiClientError } from "@/lib/api";
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useAccounts } from "@/hooks/useAccounts";
import { useUser } from "@/hooks/useUser";
import { authorLine } from "@/lib/account-sharing";
import { useDeleteTransaction, useTransaction } from "@/hooks/useTransactions";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { MoneyAmount } from "@/components/common/money-amount";
import { TypeBadge } from "@/components/common/badges";
import { RecurringPanel } from "@/components/transactions/recurring-panel";
import { Repeat } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { formatDateTime, formatMoney, transactionAmount } from "@/lib/format";
import { ledgerAccountName, transactionAccountLegs } from "@/lib/transaction-accounts";
import type { Account, TransactionType } from "@/lib/types";

export function TransactionDetail({ id }: { id: string }) {
  const router = useRouter();
  // After a delete the page goes back to the list; Undo in the toast brings the user back here.
  const deleteMut = useDeleteTransaction({ onUndone: (undoneId) => router.push(`/transactions/${undoneId}`) });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const { data: tx, isLoading, isError, error, refetch } = useTransaction(id);

  // Older responses carried legs without their account, so the account list (archived included)
  // resolves those; it also says which accounts are shared, for showing who entered this.
  const accountsQuery = useAccounts("all");
  const { data: user } = useUser();
  const accountsById = React.useMemo<ReadonlyMap<string, Account> | undefined>(() => {
    if (accountsQuery.data) return new Map(accountsQuery.data.map((a) => [a.id, a]));
    // A failed lookup resolves to "Deleted account" rather than a spinner forever.
    return accountsQuery.isError ? new Map() : undefined;
  }, [accountsQuery.data, accountsQuery.isError]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-60 w-full rounded-card" />
        <Skeleton className="h-36 w-full rounded-card" />
        <Skeleton className="h-32 w-full rounded-card" />
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

  const onSharedAccount = tx.items.some((item) => accountsById?.get(item.accountId)?.isShared);
  const author = onSharedAccount ? authorLine(tx, user?.id) : null;

  const split = tx.items.length > 1;
  const TypeIcon = TYPE_ICON[tx.type];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
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
        {tx.canEdit !== false && (
          <div className="flex items-center gap-2">
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
        )}
      </div>

      <Card className="flex-row flex-wrap items-center gap-x-4 gap-y-3 border-0 p-5 sm:p-6">
        {tx.category && !split ? (
          <CategoryAvatar category={tx.category} className="size-12 rounded-2xl" />
        ) : (
          <span
            aria-hidden
            className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", TYPE_TINT[tx.type])}
          >
            <TypeIcon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold first-letter:uppercase">{tx.description}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <TypeBadge type={tx.type} />
            <span className="text-sm text-muted-foreground tabular">{formatDateTime(tx.occurredAt)}</span>
          </div>
        </div>
        <HeroAmount amount={transactionAmount(tx)} currency={tx.currency} type={tx.type} />
      </Card>

      <Card className="gap-0 border-0 py-1">
        <dl className="divide-y divide-border">
          {tx.type === "TRANSFER" ? (
            <DetailRow label="Accounts">
              <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
                <span className="break-words">{nameOf(legs.from)}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-label="to" />
                <span className="break-words">{nameOf(legs.to)}</span>
              </span>
            </DetailRow>
          ) : (
            singleAccountLeg && <DetailRow label="Account">{nameOf(singleAccountLeg)}</DetailRow>
          )}
          {tx.type !== "TRANSFER" && (
            <DetailRow label="Category">
              {split ? (
                <span className="text-muted-foreground">Split across {tx.items.length} items</span>
              ) : tx.category ? (
                <span className="flex items-center gap-1.5">
                  <CategoryGlyph
                    category={tx.category}
                    className="size-4"
                    style={{ color: tx.category.color || undefined }}
                  />
                  {tx.category.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Uncategorized</span>
              )}
            </DetailRow>
          )}
          {author && <DetailRow label="Added by">{author}</DetailRow>}
          {tx.parentTransactionId && (
            <DetailRow label="Series">
              <Link
                href={`/transactions/${tx.parentTransactionId}`}
                className="inline-flex items-center gap-1 text-primary-text underline-offset-4 hover:underline"
              >
                <Repeat className="size-3.5" aria-hidden />
                Generated from a recurring series
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Link>
            </DetailRow>
          )}
        </dl>
        {tx.isRecurring && !tx.parentTransactionId && (
          <div className="px-5 pb-4 [&>div]:mt-0">
            <RecurringPanel tx={tx} />
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

      <Card className="gap-0 border-0 py-0">
        <div className="-my-1 flex items-center gap-0.5 px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold">Ledger entries</h2>
          <HelpHint label="About ledger entries">
            {tx.type === "TRANSFER"
              ? "Money out of one account and into the other."
              : "How this transaction changed your account balance."}
          </HelpHint>
        </div>
        {tx.items.length === 0 ? (
          <p className="px-5 pt-2 pb-5 text-sm text-muted-foreground">No ledger entries recorded.</p>
        ) : (
          <ul className="divide-y divide-border pb-1">
            {tx.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                {/* DEBIT = out of the account, CREDIT = into it. Neutral on purpose:
                    a transfer's "out" leg is not a loss. */}
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  aria-label={item.direction === "DEBIT" ? "Out" : "In"}
                  role="img"
                >
                  {item.direction === "DEBIT" ? (
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  ) : (
                    <ArrowDownLeft className="size-4" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{nameOf(item)}</p>
                  {split && (
                    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {item.category ? (
                        <>
                          <CategoryGlyph
                            category={item.category}
                            className="size-3.5 shrink-0"
                            style={{ color: item.category.color || undefined }}
                          />
                          <span className="truncate">{item.category.name}</span>
                        </>
                      ) : (
                        "Uncategorized"
                      )}
                      {item.memo && item.memo !== tx.description && <span className="truncate">· {item.memo}</span>}
                    </p>
                  )}
                </div>
                <MoneyAmount amount={item.amount} currency={item.currency} className="shrink-0 text-sm font-medium" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const TYPE_ICON = { EXPENSE: ArrowUpRight, INCOME: ArrowDownLeft, TRANSFER: ArrowLeftRight } as const;
const TYPE_TINT = {
  EXPENSE: "bg-destructive/10 text-destructive",
  INCOME: "bg-success/12 text-success",
  TRANSFER: "bg-secondary text-muted-foreground",
} as const;

/**
 * The headline amount: a tight sign, the figure large, and a currency code (TND, CHF…) small beside
 * it so it doesn't outweigh the number. Only income is coloured; an expense reads as plain spending.
 */
function HeroAmount({ amount, currency, type }: { amount: string; currency: string; type: TransactionType }) {
  const formatted = formatMoney(amount, currency);
  const code = formatted.match(/^(.*?)\s*([A-Z]{3})$/);
  const figure = code ? code[1] : formatted;
  const sign = type === "EXPENSE" ? "−" : type === "INCOME" ? "+" : "";
  return (
    <p
      className={cn(
        "flex shrink-0 items-baseline gap-1 font-semibold tracking-tight tabular max-sm:basis-full max-sm:pl-16",
        type === "INCOME" && "text-success",
      )}
    >
      <span className="sr-only">{`${type === "EXPENSE" ? "-" : ""}${formatMoney(amount, currency)}`}</span>
      <span aria-hidden className="text-2xl sm:text-3xl">
        {sign}
        {figure}
      </span>
      {code && (
        <span aria-hidden className="text-sm font-medium text-muted-foreground">
          {code[2]}
        </span>
      )}
    </p>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
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
