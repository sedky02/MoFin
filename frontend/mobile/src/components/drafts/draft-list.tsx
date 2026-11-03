import { CheckCircle2, Sparkles, XCircle, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { EmptyState, ErrorState, SkeletonRows } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { DraftStatus, ParsedTransactionData } from '@/core/types';
import { useApproveDraft, useDrafts, useRejectDraft } from '@/hooks/useDrafts';

import { DraftCard } from './draft-card';

const EMPTY: Record<DraftStatus, { title: string; description: string; icon: LucideIcon }> = {
  PENDING: {
    title: 'No drafts waiting',
    description: "Describe a transaction above and it'll appear here for review.",
    icon: Sparkles,
  },
  APPROVED: {
    title: 'Nothing approved yet',
    description: 'Approved drafts become real transactions and show up here.',
    icon: CheckCircle2,
  },
  REJECTED: {
    title: 'No rejected drafts',
    description: 'Drafts you reject are kept here for reference.',
    icon: XCircle,
  },
};

export function DraftList({ status }: { status: DraftStatus }) {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useDrafts(status);
  const approve = useApproveDraft();
  const reject = useRejectDraft();
  const drafts = data?.pages.flatMap((page) => page.data) ?? [];

  // Not optimistic: an approval can be refused by the server, and removing the card first would also
  // throw away the review form's edits. The promise rejects on failure so the form shows field errors.
  async function handleApprove(id: string, edits: Partial<ParsedTransactionData>) {
    await approve.mutateAsync({ id, edits });
  }
  function handleReject(id: string, reason?: string) {
    reject.mutate({ id, reason });
  }

  if (isLoading) return <SkeletonRows rows={3} />;
  if (isError) return <ErrorState description="Couldn't load drafts." onRetry={() => refetch()} />;
  if (drafts.length === 0) {
    const e = EMPTY[status];
    return <EmptyState icon={e.icon} title={e.title} description={e.description} />;
  }

  return (
    <View className="gap-3">
      {drafts.map((draft) => (
        <DraftCard
          key={draft.id}
          draft={draft}
          approving={approve.isPending && approve.variables?.id === draft.id}
          rejecting={reject.isPending && reject.variables?.id === draft.id}
          onApprove={status === 'PENDING' ? handleApprove : undefined}
          onReject={status === 'PENDING' ? handleReject : undefined}
        />
      ))}
      {hasNextPage ? (
        <View className="items-center pt-2">
          <Button variant="outline" className="min-h-11" disabled={isFetchingNextPage} onPress={() => fetchNextPage()}>
            <Text>{isFetchingNextPage ? 'Loading…' : 'Load more'}</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
