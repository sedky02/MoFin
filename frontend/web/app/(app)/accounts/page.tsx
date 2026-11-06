"use client";

import * as React from "react";
import { Archive, ArrowLeft, Plus, Wallet } from "lucide-react";
import { useAccounts, useArchiveAccount, useRestoreAccount, useUpdateAccount } from "@/hooks/useAccounts";
import { AccountRow } from "@/components/accounts/account-card";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { AccountMembersDialog } from "@/components/accounts/account-members-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useAccountMembers, useSetHideAmount } from "@/hooks/useAccountSharing";
import { isAmountHidden, withHideAmount } from "@/lib/account-privacy";
import { canManage, memberName } from "@/lib/account-sharing";
import type { Account, AccountType } from "@/lib/types";

const GROUPS: { type: AccountType; title: string }[] = [
  { type: "BANK", title: "Bank" },
  { type: "CASH", title: "Cash" },
  { type: "SAVINGS", title: "Savings" },
  { type: "CRYPTO", title: "Crypto" },
];

/** A titled section of account cards; each account stays its own card. */
function Group({
  title,
  hint,
  items,
  ...actions
}: {
  title: string;
  hint?: string;
  items: Account[];
  onEdit?: (a: Account) => void;
  onToggleHidden?: (a: Account) => void;
  onArchive?: (a: Account) => void;
  onRestore?: (a: Account) => void;
  onMembers?: (a: Account) => void;
  busyId?: string;
}) {
  if (items.length === 0) return null;
  const { busyId, ...rowActions } = actions;
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center gap-3 px-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint ?? items.length}</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((a) => (
          <AccountRow key={a.id} account={a} busy={busyId === a.id} {...rowActions} />
        ))}
      </ul>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="gap-4 border-0 p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
          <Skeleton className="h-8 w-36" />
        </Card>
      ))}
    </div>
  );
}

export default function AccountsPage() {
  // Two views of the same page: the active accounts, or the archived ones on their own.
  const [view, setView] = React.useState<"active" | "archived">("active");

  const active = useAccounts("active");
  const archived = useAccounts("archived");
  const archive = useArchiveAccount();
  const update = useUpdateAccount();
  const setHideAmount = useSetHideAmount();
  // The eye beside Edit: hides or shows this account's balance everywhere. Each person's own
  // choice: the owner's is saved on the account, a member's on their membership.
  const toggleHidden = (a: Account) =>
    canManage(a)
      ? update.mutate({ id: a.id, metadata: withHideAmount(a.metadata, !isAmountHidden(a)) })
      : setHideAmount.mutate({ accountId: a.id, hideAmount: !isAmountHidden(a) });
  const restore = useRestoreAccount();
  const archivedCount = archived.data?.length ?? 0;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Account | undefined>();
  const [toArchive, setToArchive] = React.useState<Account | undefined>();
  const [membersOf, setMembersOf] = React.useState<Account | undefined>();
  // Archiving takes the account away from everyone on it, so the warning names them.
  const { data: archiveMembers } = useAccountMembers(toArchive?.isShared ? toArchive.id : undefined);
  const othersOnArchive = (archiveMembers ?? []).filter((m) => !m.isYou).map(memberName);

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

  const restoringId = (restore.isPending && restore.variables) || undefined;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Accounts"
        description="Cash, bank, savings and crypto — each tracked by the ledger."
        action={
          // The page's actions sit together: switch view on the left, the primary action last.
          <div className="flex flex-wrap items-center gap-2">
            {view === "active" ? (
              <Button variant="outline" onClick={() => setView("archived")} className="gap-2">
                <Archive className="size-4" aria-hidden />
                {archivedCount > 0 ? `Archived (${archivedCount})` : "Archived"}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setView("active")} className="gap-2">
                <ArrowLeft className="size-4" aria-hidden />
                Back to accounts
              </Button>
            )}
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />
              New account
            </Button>
          </div>
        }
      />

      {view === "active" ? (
        active.isLoading ? (
          <ListSkeleton />
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
          <div className="space-y-8">
            {GROUPS.map((g) => (
              <Group
                key={g.type}
                title={g.title}
                items={optimisticAccounts.filter((a) => a.type === g.type)}
                onEdit={openEdit}
                onToggleHidden={toggleHidden}
                onArchive={setToArchive}
                onMembers={setMembersOf}
                busyId={update.isPending ? update.variables?.id : undefined}
              />
            ))}
          </div>
        )
      ) : archived.isLoading ? (
        <ListSkeleton />
      ) : archived.isError ? (
        <ErrorState
          description="Couldn't load your archived accounts."
          onRetry={() => archived.refetch()}
        />
      ) : archivedCount === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No archived accounts"
          description="Accounts you archive will show up here."
        />
      ) : (
        <div>
          <Group
            title="Archived"
            hint="hidden from your list, history kept"
            items={archived.data ?? []}
            onRestore={(a) => restore.mutate(a.id)}
            onMembers={setMembersOf}
            busyId={restoringId}
          />
        </div>
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editing}
      />

      <AccountMembersDialog account={membersOf} onClose={() => setMembersOf(undefined)} />

      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(o) => !o && setToArchive(undefined)}
        title={`Archive "${toArchive?.name}"?`}
        description={
          toArchive?.isShared
            ? `This removes the account for everyone on it${othersOnArchive.length ? `: ${othersOnArchive.join(", ")}` : ""}. They can't add to it, and only see it under Archived. Its history is preserved, and you can restore it later.`
            : "This hides the account from your list. Its history and ledger entries are preserved. You can restore it later from Archived. Any goals linked to this account keep running."
        }
        confirmLabel="Archive"
        onConfirm={confirmArchive}
      />
    </div>
  );
}
