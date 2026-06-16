"use client";

import * as React from "react";
import { Plus, Wallet } from "lucide-react";
import { useAccounts, useArchiveAccount } from "@/hooks/useAccounts";
import { AccountCard } from "@/components/accounts/account-card";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { SkeletonCard, EmptyState, ErrorState } from "@/components/common/states";
import type { Account } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AccountsPage() {
  const { data, isLoading, isError, refetch } = useAccounts();
  const archive = useArchiveAccount();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Account | undefined>();
  const [toArchive, setToArchive] = React.useState<Account | undefined>();

  // Instant list removal on archive (React 19 useOptimistic).
  const [optimisticAccounts, removeOptimistic] = React.useOptimistic(
    data ?? [],
    (state: Account[], id: string) => state.filter((a) => a.id !== id),
  );

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }
  function openEdit(account: Account) {
    setEditing(account);
    setDialogOpen(true);
  }

  function confirmArchive() {
    if (!toArchive) return;
    const id = toArchive.id;
    setToArchive(undefined);
    React.startTransition(async () => {
      removeOptimistic(id);
      await archive.mutateAsync(id).catch(() => {});
    });
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Cash, bank, savings and crypto — each tracked by the ledger."
        action={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" />
            New account
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="Couldn't load your accounts." onRetry={() => refetch()} />
      ) : optimisticAccounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Create your first account to start tracking balances."
          action={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />
              New account
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {optimisticAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onEdit={openEdit}
              onArchive={setToArchive}
            />
          ))}
        </div>
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editing}
      />

      <AlertDialog
        open={!!toArchive}
        onOpenChange={(o) => !o && setToArchive(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{toArchive?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides the account from your list. Its history and ledger entries
              are preserved. You can&apos;t undo this from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmArchive}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
