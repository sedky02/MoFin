import { View } from 'react-native';

import { DraftCard } from '@/components/drafts/draft-card';
import type { DraftTransaction, ParsedTransactionData } from '@/core/types';
import { useApproveDraft, useRejectDraft } from '@/hooks/useDrafts';

/**
 * Same cards and requests as the Drafts inbox: a decision here refreshes the inbox and vice versa,
 * and a draft handled elsewhere shows its status instead of buttons.
 */
export function ChatDraftCards({ drafts }: { drafts: DraftTransaction[] }) {
  const approve = useApproveDraft();
  const reject = useRejectDraft();
  if (drafts.length === 0) return null;

  // The promise rejects on failure, so the review form keeps its edits and shows field errors.
  async function handleApprove(id: string, edits: Partial<ParsedTransactionData>) {
    await approve.mutateAsync({ id, edits });
  }

  return (
    <View className="gap-3">
      {drafts.map((draft) => {
        const pending = draft.status === 'PENDING';
        return (
          <DraftCard
            key={draft.id}
            draft={draft}
            variant="chat"
            approving={approve.isPending && approve.variables?.id === draft.id}
            rejecting={reject.isPending && reject.variables?.id === draft.id}
            onApprove={pending ? handleApprove : undefined}
            onReject={pending ? (id, reason) => reject.mutate({ id, reason }) : undefined}
          />
        );
      })}
    </View>
  );
}
