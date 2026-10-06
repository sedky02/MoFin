"use client";

import * as React from "react";
import type { DraftStatus, DraftTransaction, ParsedTransactionData } from "@/lib/types";
import { useDrafts, useApproveDraft, useRejectDraft } from "@/hooks/useDrafts";
import { DraftCard } from "./draft-card";
import { Button } from "@/components/ui/button";
import { SkeletonRows, EmptyState, ErrorState } from "@/components/common/states";
import { Sparkles, CheckCircle2, XCircle } from "lucide-react";

const EMPTY: Record<DraftStatus, { title: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: {
    title: "No drafts waiting",
    description: "Describe a transaction above and it'll appear here for review.",
    icon: Sparkles,
  },
  APPROVED: {
    title: "Nothing approved yet",
    description: "Approved drafts become real transactions and show up here.",
    icon: CheckCircle2,
  },
  REJECTED: {
    title: "No rejected drafts",
    description: "Drafts you reject are kept here for reference.",
    icon: XCircle,
  },
};

export function DraftList({ status }: { status: DraftStatus }) {
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDrafts(status);
  const approve = useApproveDraft();
  const reject = useRejectDraft();

  // React Compiler memoizes this derivation — no manual useMemo.
  const flat = data?.pages.flatMap((page) => page.data) ?? [];

  // Instant card removal on approve/reject (React 19 useOptimistic).
  const [optimistic, removeOptimistic] = React.useOptimistic(
    flat,
    (state: DraftTransaction[], id: string) => state.filter((d) => d.id !== id),
  );

  const listRef = React.useRef<HTMLDivElement>(null);

  // The focused button unmounts with its card; hand focus to the next card's
  // first action (or the list itself) so keyboard users don't restart at <body>.
  function refocusAfterRemoval(id: string) {
    const cards = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-draft-id]") ?? []);
    const idx = cards.findIndex((c) => c.dataset.draftId === id);
    const next = cards[idx + 1] ?? cards[idx - 1];
    requestAnimationFrame(() => {
      (next?.querySelector<HTMLElement>("button:not([disabled])") ?? listRef.current)?.focus();
    });
  }

  // Not optimistic: an approval can be rejected by the server (400), and
  // removing the card first would also throw away the user's review-form edits.
  function handleApprove(id: string, edits: Partial<ParsedTransactionData>) {
    approve
      .mutateAsync({ id, edits })
      .then(() => refocusAfterRemoval(id))
      .catch(() => {});
  }

  function handleReject(id: string, reason?: string) {
    refocusAfterRemoval(id);
    React.startTransition(async () => {
      removeOptimistic(id);
      await reject.mutateAsync({ id, reason }).catch(() => {});
    });
  }

  if (isLoading) return <SkeletonRows rows={3} />;
  if (isError) return <ErrorState description="Couldn't load drafts." onRetry={() => refetch()} />;

  if (optimistic.length === 0) {
    const e = EMPTY[status];
    return <EmptyState icon={e.icon} title={e.title} description={e.description} />;
  }

  return (
    <div ref={listRef} tabIndex={-1} className="space-y-3 outline-none">
      {optimistic.map((draft) => (
        <div key={draft.id} data-draft-id={draft.id}>
          <DraftCard
            draft={draft}
            approving={approve.isPending && approve.variables?.id === draft.id}
            rejecting={reject.isPending && reject.variables?.id === draft.id}
            onApprove={status === "PENDING" ? handleApprove : undefined}
            onReject={status === "PENDING" ? handleReject : undefined}
          />
        </div>
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
