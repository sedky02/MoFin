import * as React from 'react';
import { View } from 'react-native';

import { MoneyAmount } from '@/components/common/money-amount';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/core/format';
import type { DraftStatus, DraftTransaction, ParsedTransactionData, TransactionType } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { Check, ChevronDown, Quote, X } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { confidenceTier, draftAccountSummary, draftDisplayAmount, quickApproveState, rejectionReasonOf } from './draft-model';
import { DraftReviewForm } from './draft-review-form';

// Amber text on its own 15% tint is 4.1:1 in the light theme; this darker amber (amber-800) is 6+.
const WARNING_ON_TINT = 'text-[#92400e] dark:text-warning';

const TYPE_STYLE: Record<TransactionType, { label: string; bg: string; text: string }> = {
  EXPENSE: { label: 'Expense', bg: 'bg-destructive/10', text: 'text-destructive' },
  INCOME: { label: 'Income', bg: 'bg-success/15', text: 'text-success' },
  TRANSFER: { label: 'Transfer', bg: 'bg-secondary', text: 'text-foreground' },
};

const TIER_STYLE = {
  high: { bg: 'bg-success/15', text: 'text-success' },
  medium: { bg: 'bg-warning/15', text: WARNING_ON_TINT },
  low: { bg: 'bg-destructive/15', text: 'text-destructive' },
  none: { bg: 'bg-muted', text: 'text-muted-foreground' },
} as const;

const STATUS_STYLE: Record<DraftStatus, { label: string; bg: string; text: string }> = {
  PENDING: { label: 'Pending', bg: 'bg-warning/15', text: WARNING_ON_TINT },
  APPROVED: { label: 'Approved', bg: 'bg-success/15', text: 'text-success' },
  REJECTED: { label: 'Rejected', bg: 'bg-destructive/15', text: 'text-destructive' },
};

function Pill({ label, bg, text, a11y }: { label: string; bg: string; text: string; a11y?: string }) {
  return (
    <View accessible accessibilityLabel={a11y ?? label} className={cn('self-start rounded-full px-2 py-0.5', bg)}>
      <Text className={cn('text-xs font-medium', text)}>{label}</Text>
    </View>
  );
}

export function DraftCard({
  draft,
  approving,
  rejecting,
  onApprove,
  onReject,
}: {
  draft: DraftTransaction;
  approving?: boolean;
  rejecting?: boolean;
  onApprove?: (id: string, edits: Partial<ParsedTransactionData>) => void | Promise<void>;
  onReject?: (id: string, reason?: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const isPending = draft.status === 'PENDING';
  const p = draft.parsedData;
  const { data: accounts } = useAccounts('all');
  const quick = quickApproveState(draft);
  const accountSummary = draftAccountSummary(p, accounts);
  const amount = draftDisplayAmount(p);
  const conf = confidenceTier(draft.confidenceScore);
  const type = p.type ? TYPE_STYLE[p.type] : null;
  const rejectedReason = rejectionReasonOf(draft);

  return (
    <View testID={`draft-${draft.id}`} className="overflow-hidden rounded-xl border border-border bg-card">
      <View className="p-4">
        <View className="flex-row items-start gap-2.5">
          <Icon as={Quote} size={16} aria-hidden className="mt-0.5 text-muted-foreground/60" />
          <Text className="min-w-0 flex-1 text-sm italic text-muted-foreground">“{draft.rawInput}”</Text>
          {isPending ? (
            <Pill label={conf.label} {...TIER_STYLE[conf.tier]} a11y={`Confidence ${conf.label}`} />
          ) : (
            <Pill {...STATUS_STYLE[draft.status]} />
          )}
        </View>

        <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-2">
          {type ? <Pill label={type.label} bg={type.bg} text={type.text} /> : null}
          <Text className="text-sm font-medium">{p.description}</Text>
          {accountSummary ? <Text className="text-xs text-muted-foreground">{accountSummary}</Text> : null}
        </View>
        <View className="mt-2 flex-row items-center justify-between gap-3">
          <Text className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
            {formatDate(p.occurredAt ?? draft.createdAt)}
          </Text>
          {amount && p.currency ? (
            <MoneyAmount
              amount={amount}
              currency={p.currency}
              colorBySign={p.type === 'EXPENSE' || p.type === 'INCOME'}
              className="text-base font-semibold"
            />
          ) : null}
        </View>

        {isPending ? (
          <View className="mt-4 gap-2">
            <View className="flex-row flex-wrap items-center gap-2">
              <Button
                className="min-h-11 gap-1.5"
                disabled={approving || quick.blocked}
                accessibilityLabel="Approve"
                accessibilityHint={quick.blocked ? `${quick.reason}. Use Review and edit` : undefined}
                onPress={() => void Promise.resolve(onApprove?.(draft.id, {})).catch(() => {})}>
                <Icon as={Check} size={16} className="text-primary-foreground" />
                <Text>Approve</Text>
              </Button>
              <Button
                variant="outline"
                className="min-h-11 gap-1.5"
                aria-expanded={expanded}
                accessibilityLabel="Review & edit"
                onPress={() => setExpanded((v) => !v)}>
                <Icon as={ChevronDown} size={16} className={expanded ? 'rotate-180' : undefined} />
                <Text>Review &amp; edit</Text>
              </Button>
              <Button
                variant="ghost"
                className="ml-auto min-h-11 gap-1.5"
                disabled={rejecting}
                accessibilityLabel="Reject"
                onPress={() => setRejectOpen((v) => !v)}>
                <Icon as={X} size={16} className="text-muted-foreground" />
                <Text className="text-muted-foreground">Reject</Text>
              </Button>
            </View>
            {quick.blocked ? <Text className="text-xs text-muted-foreground">{quick.reason} — review first</Text> : null}
          </View>
        ) : null}

        {isPending && rejectOpen ? (
          <View className="mt-3 gap-2 rounded-lg bg-secondary/60 p-3">
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder="Reason (optional)"
              accessibilityLabel="Reason (optional)"
              className="min-h-11 bg-background"
            />
            <View className="flex-row justify-end gap-2">
              <Button variant="ghost" className="min-h-11" accessibilityLabel="Keep" onPress={() => setRejectOpen(false)}>
                <Text>Keep</Text>
              </Button>
              <Button
                variant="destructive"
                className="min-h-11"
                disabled={rejecting}
                accessibilityLabel="Reject draft"
                onPress={() => onReject?.(draft.id, reason.trim() || undefined)}>
                <Text>Reject draft</Text>
              </Button>
            </View>
          </View>
        ) : null}
      </View>

      {isPending && expanded ? (
        <View className="px-4 pb-4">
          <DraftReviewForm
            draft={draft}
            approving={!!approving}
            onApprove={(edits) => onApprove?.(draft.id, edits)}
            onCancel={() => setExpanded(false)}
          />
        </View>
      ) : null}

      {draft.status === 'REJECTED' && rejectedReason ? (
        <View className="border-t border-border bg-secondary/30 px-4 py-2.5">
          <Text className="text-xs text-muted-foreground">Reason: {rejectedReason}</Text>
        </View>
      ) : null}
    </View>
  );
}
