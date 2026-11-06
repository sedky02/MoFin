"use client";

import { DraftCard } from "@/components/drafts/draft-card";
import { useApproveDraft, useRejectDraft } from "@/hooks/useDrafts";
import type { DraftTransaction, ParsedTransactionData } from "@/lib/types";

/**
 * The drafts an answer created, as the same cards and requests as the Drafts page, so a decision
 * here refreshes the inbox and vice versa.
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
    <div className="grid gap-3">
      {drafts.map((draft) => {
        const pending = draft.status === "PENDING";
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
    </div>
  );
}
