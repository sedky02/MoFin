import { router } from 'expo-router';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountDialog } from '@/components/accounts/account-dialog';
import { AccountRow } from '@/components/accounts/account-row';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { isAmountHidden, withHideAmount } from '@/core/account-privacy';
import { canManage, memberName } from '@/core/account-sharing';
import type { Account, AccountType } from '@/core/types';
import { useAccountMembers, useSetHideAmount } from '@/hooks/useAccountSharing';
import { useAccounts, useArchiveAccount, useRestoreAccount, useUpdateAccount } from '@/hooks/useAccounts';
import { Archive, ArrowLeft, Plus, Wallet } from '@/lib/icons';

const GROUPS: { type: AccountType; title: string }[] = [
  { type: 'BANK', title: 'Bank' },
  { type: 'CASH', title: 'Cash' },
  { type: 'SAVINGS', title: 'Savings' },
  { type: 'CRYPTO', title: 'Crypto' },
];

type RowActions = {
  onEdit?: (a: Account) => void;
  onToggleHidden?: (a: Account) => void;
  onArchive?: (a: Account) => void;
  onRestore?: (a: Account) => void;
  onMembers?: (a: Account) => void;
  busyId?: string;
};

function Group({ title, hint, items, busyId, ...actions }: { title: string; hint?: string; items: Account[] } & RowActions) {
  if (items.length === 0) return null;
  return (
    <View accessibilityLabel={title} className="gap-3">
      <View className="flex-row items-center gap-3 px-1">
        <Text role="heading" aria-level={2} className="text-sm font-semibold">
          {title}
        </Text>
        <Text className="shrink text-xs text-muted-foreground">{hint ?? items.length}</Text>
        <View aria-hidden className="h-px flex-1 bg-border" />
      </View>
      {items.map((a) => (
        <AccountRow key={a.id} account={a} busy={busyId === a.id} {...actions} />
      ))}
    </View>
  );
}

function ListSkeleton() {
  return (
    <View aria-busy accessibilityLabel="Loading" className="gap-4">
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const [view, setView] = React.useState<'active' | 'archived'>('active');
  const active = useAccounts('active');
  const archived = useAccounts('archived');
  const archive = useArchiveAccount();
  const update = useUpdateAccount();
  const setHideAmount = useSetHideAmount();
  // The eye beside Edit: hides or shows this account's balance everywhere. Each person's own
  // choice: the owner's is saved on the account, a member's on their membership.
  const toggleHidden = (a: Account) =>
    canManage(a)
      ? update.mutate({ id: a.id, metadata: withHideAmount(a.metadata, !isAmountHidden(a)) })
      : setHideAmount.mutate({ accountId: a.id, hideAmount: !isAmountHidden(a) });
  const openMembers = (a: Account) => router.push(`/accounts/${a.id}`);
  const restore = useRestoreAccount();
  const archivedCount = archived.data?.length ?? 0;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Account | undefined>();
  const [toArchive, setToArchive] = React.useState<Account | undefined>();
  // Archiving takes the account away from everyone on it, so the warning names them.
  const { data: archiveMembers } = useAccountMembers(toArchive?.isShared ? toArchive.id : undefined);
  const othersOnArchive = (archiveMembers ?? []).filter((m) => !m.isYou).map(memberName);

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
    archive.mutate(toArchive.id);
    setToArchive(undefined);
  }

  const restoringId = (restore.isPending && restore.variables) || undefined;
  const list = view === 'active' ? active : archived;
  const accounts = active.data ?? [];

  const newButton = (
    <Button onPress={openCreate} className="min-h-11 gap-2" accessibilityLabel="New account">
      <Icon as={Plus} size={16} className="text-primary-foreground" />
      <Text>New account</Text>
    </Button>
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="mx-auto w-full max-w-3xl p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isLoading} onRefresh={async () => void (await list.refetch())} />}>

      <View className="mb-5 flex-row flex-wrap gap-2">
        {view === 'active' ? (
          <Button variant="outline" className="min-h-11 gap-2" onPress={() => setView('archived')}>
            <Icon as={Archive} size={16} aria-hidden />
            <Text>{archivedCount > 0 ? `Archived (${archivedCount})` : 'Archived'}</Text>
          </Button>
        ) : (
          <Button variant="outline" className="min-h-11 gap-2" onPress={() => setView('active')}>
            <Icon as={ArrowLeft} size={16} aria-hidden />
            <Text>Back to accounts</Text>
          </Button>
        )}
        {newButton}
      </View>

      {view === 'active' ? (
        active.isLoading ? (
          <ListSkeleton />
        ) : active.isError ? (
          <ErrorState description="Couldn't load your accounts." onRetry={() => active.refetch()} />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Create your first account to start tracking balances."
            action={newButton}
          />
        ) : (
          <View className="gap-8">
            {GROUPS.map((g) => (
              <Group
                key={g.type}
                title={g.title}
                items={accounts.filter((a) => a.type === g.type)}
                onEdit={openEdit}
                onToggleHidden={toggleHidden}
                onArchive={setToArchive}
                onMembers={openMembers}
                busyId={update.isPending ? update.variables?.id : undefined}
              />
            ))}
          </View>
        )
      ) : archived.isLoading ? (
        <ListSkeleton />
      ) : archived.isError ? (
        <ErrorState description="Couldn't load your archived accounts." onRetry={() => archived.refetch()} />
      ) : archivedCount === 0 ? (
        <EmptyState icon={Wallet} title="No archived accounts" description="Accounts you archive will show up here." />
      ) : (
        <Group
          title="Archived"
          hint="hidden from your list, history kept"
          items={archived.data ?? []}
          onRestore={(a) => restore.mutate(a.id)}
          onMembers={openMembers}
          busyId={restoringId}
        />
      )}

      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />

      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(o) => !o && setToArchive(undefined)}
        title={`Archive "${toArchive?.name}"?`}
        description={
          toArchive?.isShared
            ? `This removes the account for everyone on it${othersOnArchive.length ? `: ${othersOnArchive.join(', ')}` : ''}. They can't add to it, and only see it under Archived. Its history is preserved, and you can restore it later.`
            : 'This hides the account from your list. Its history and ledger entries are preserved. You can restore it later from Archived. Any goals linked to this account keep running.'
        }
        confirmLabel="Archive"
        onConfirm={confirmArchive}
      />
    </ScrollView>
  );
}
