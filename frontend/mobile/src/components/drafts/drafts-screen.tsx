import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { draftKeys } from '@/core/query-keys';
import type { DraftStatus } from '@/core/types';
import { usePendingDraftCount } from '@/hooks/useDrafts';

import { DraftComposer } from './draft-composer';
import { DraftList } from './draft-list';

const TABS: { value: DraftStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

export function DraftsScreen() {
  // `?compose=1` comes from the add sheet's "Describe it": start typing straight away.
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<DraftStatus>('PENDING');
  const [refreshing, setRefreshing] = React.useState(false);
  const { data: pending } = usePendingDraftCount();

  async function refresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: draftKeys.all });
    setRefreshing(false);
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="mx-auto w-full max-w-2xl p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <PageHeader
        description="Write what you spent or earned in your own words. MoFin turns it into a draft, and nothing is recorded until you approve it."
        className="mb-4"
      />
      <DraftComposer autoFocus={compose === '1'} />
      <View className="mt-8">
        <Tabs value={tab} onValueChange={(v) => setTab(v as DraftStatus)}>
          <TabsList className="h-12 w-full">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="min-h-11 flex-1"
                accessibilityLabel={t.value === 'PENDING' && pending ? `Pending, ${pending}` : t.label}>
                <Text>{t.value === 'PENDING' && pending ? `${t.label} (${pending})` : t.label}</Text>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <View className="mt-4">
          <DraftList key={tab} status={tab} />
        </View>
      </View>
    </ScrollView>
  );
}
