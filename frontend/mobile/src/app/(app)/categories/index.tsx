import { Archive, ArrowLeft, Plus, Search, Tags } from 'lucide-react-native';
import * as React from 'react';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryDialog } from '@/components/categories/category-dialog';
import { CategoryRow, type CategoryRowActions } from '@/components/categories/category-row';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Category } from '@/core/types';
import { useArchiveCategory, useCategories, useRestoreCategory } from '@/hooks/useCategories';

/** One list of categories in a single card, rows divided by hairlines. */
function Group({ title, hint, items, ...actions }: { title: string; hint?: string; items: Category[] } & CategoryRowActions) {
  if (items.length === 0) return null;
  return (
    <Card className="gap-0 border-0 py-0">
      <View className="flex-row items-baseline justify-between gap-3 px-4 pb-2 pt-4">
        <Text role="heading" aria-level={2} className="text-sm font-semibold">
          {title}
        </Text>
        <Text className="shrink text-xs text-muted-foreground">{hint ?? items.length}</Text>
      </View>
      <View className="pb-1">
        {items.map((c) => (
          <CategoryRow key={c.id} category={c} {...actions} />
        ))}
      </View>
    </Card>
  );
}

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const [view, setView] = React.useState<'active' | 'archived'>('active');
  const { data, isLoading, isError, refetch, isRefetching } = useCategories('active');
  const archived = useCategories('archived');
  const archiveCategory = useArchiveCategory();
  const restoreCategory = useRestoreCategory();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | undefined>();
  const [toArchive, setToArchive] = React.useState<Category | undefined>();
  const [query, setQuery] = React.useState('');

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    setOpen(true);
  }

  // The row stays until the server confirms; it's only dimmed meanwhile.
  const busyId =
    (archiveCategory.isPending && archiveCategory.variables) ||
    (restoreCategory.isPending && restoreCategory.variables) ||
    undefined;

  const matches = (c: Category) => c.name.toLowerCase().includes(query.trim().toLowerCase());
  const active = (data ?? []).filter(matches);
  const archivedList = (archived.data ?? []).filter(matches);
  const expenses = active.filter((c) => c.type === 'EXPENSE');
  const income = active.filter((c) => c.type === 'INCOME');
  const archivedCount = archived.data?.length ?? 0;
  const showFilter = (data?.length ?? 0) + archivedCount > 6;
  const noMatches = (
    <Text className="py-10 text-center text-sm text-muted-foreground">No categories match &ldquo;{query.trim()}&rdquo;.</Text>
  );

  const newButton = (
    <Button onPress={openCreate} className="min-h-11 gap-2" accessibilityLabel="New category">
      <Icon as={Plus} size={16} className="text-primary-foreground" />
      <Text>New category</Text>
    </Button>
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="mx-auto w-full max-w-3xl p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isLoading}
          onRefresh={async () => {
            await Promise.all([refetch(), archived.refetch()]);
          }}
        />
      }>
      <PageHeader title="Categories" description="Organize your transactions. System categories are read-only." className="mb-4" />

      <View className="mb-5 flex-row flex-wrap gap-2">
        {view === 'active' ? (
          <Button variant="outline" className="min-h-11 gap-2" onPress={() => setView('archived')}>
            <Icon as={Archive} size={16} aria-hidden />
            <Text>{archivedCount > 0 ? `Archived (${archivedCount})` : 'Archived'}</Text>
          </Button>
        ) : (
          <Button variant="outline" className="min-h-11 gap-2" onPress={() => setView('active')}>
            <Icon as={ArrowLeft} size={16} aria-hidden />
            <Text>Back to categories</Text>
          </Button>
        )}
        {newButton}
      </View>

      {showFilter ? (
        <View className="mb-5 justify-center">
          <View pointerEvents="none" className="absolute left-3 z-10">
            <Icon as={Search} size={16} aria-hidden className="text-muted-foreground" />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filter categories"
            accessibilityLabel="Filter categories"
            role="searchbox"
            autoCapitalize="none"
            autoCorrect={false}
            className="border-input bg-background text-foreground h-11 rounded-md border pl-9 pr-3 text-base"
            placeholderTextColor="rgba(128,128,128,0.7)"
          />
        </View>
      ) : null}

      {view === 'active' ? (
        isLoading ? (
          <SkeletonRows rows={6} />
        ) : isError ? (
          <ErrorState description="Couldn't load categories." onRetry={() => refetch()} />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            icon={Tags}
            title="No categories yet"
            description="Create a category to start organizing your spending."
            action={newButton}
          />
        ) : active.length === 0 ? (
          noMatches
        ) : (
          <View className="gap-4">
            <Group title="Expenses" items={expenses} onEdit={openEdit} onArchive={setToArchive} busyId={busyId} />
            <Group title="Income" items={income} onEdit={openEdit} onArchive={setToArchive} busyId={busyId} />
          </View>
        )
      ) : archived.isLoading ? (
        <SkeletonRows rows={4} />
      ) : archived.isError ? (
        <ErrorState description="Couldn't load your archived categories." onRetry={() => archived.refetch()} />
      ) : archivedCount === 0 ? (
        <EmptyState
          icon={Tags}
          title="No archived categories"
          description="Categories you archive are hidden from pickers but stay on past transactions. They'll show up here."
        />
      ) : archivedList.length === 0 ? (
        noMatches
      ) : (
        <Group
          title="Archived"
          hint="hidden from pickers, kept on past transactions"
          items={archivedList}
          onRestore={(c) => restoreCategory.mutate(c.id)}
          busyId={busyId}
        />
      )}

      <CategoryDialog open={open} onOpenChange={setOpen} category={editing} />
      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(o) => !o && setToArchive(undefined)}
        title={`Archive "${toArchive?.name ?? ''}"?`}
        description="It will be hidden from pickers but stay on past transactions. You can restore it any time from Archived."
        confirmLabel="Archive"
        onConfirm={() => {
          if (toArchive) archiveCategory.mutate(toArchive.id);
          setToArchive(undefined);
        }}
      />
    </ScrollView>
  );
}
