"use client";

import * as React from "react";
import { Plus, Wallet } from "lucide-react";
import { useAccounts, useArchiveAccount, useRestoreAccount } from "@/hooks/useAccounts";
import { AccountCard } from "@/components/accounts/account-card";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonCard, EmptyState, ErrorState } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { Account } from "@/lib/types";

export default function AccountsPage() {
  const [tab, setTab] = React.useState<"active" | "archived">("active");

  const active = useAccounts("active");
  const archived = useAccounts("archived", tab === "archived");
  const archive = useArchiveAccount();
  const restore = useRestoreAccount();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Account | undefined>();
  const [toArchive, setToArchive] = React.useState<Account | undefined>();

  // Instant list removal on archive (React 19 useOptimistic).
  const [optimisticAccounts, removeOptimistic] = React.useOptimistic(
    active.data ?? [],
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          {active.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : active.isError ? (
            <ErrorState description="Couldn't load your accounts." onRetry={() => active.refetch()} />
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
        </TabsContent>

        <TabsContent value="archived" className="mt-6">
          {archived.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : archived.isError ? (
            <ErrorState
              description="Couldn't load your archived accounts."
              onRetry={() => archived.refetch()}
            />
          ) : !archived.data || archived.data.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No archived accounts"
              description="Accounts you archive will show up here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {archived.data.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onRestore={(a) => restore.mutate(a.id)}
                  readOnly
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editing}
      />

      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(o) => !o && setToArchive(undefined)}
        title={`Archive "${toArchive?.name}"?`}
        description="This hides the account from your list. Its history and ledger entries are preserved. You can restore it later from the Archived tab."
        confirmLabel="Archive"
        onConfirm={confirmArchive}
      />
    </>
  );
}
