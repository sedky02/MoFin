"use client";

import * as React from "react";
import { ChevronDown, X, Check, Quote } from "lucide-react";
import type { DraftTransaction, ParsedTransactionData } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyAmount } from "@/components/common/money-amount";
import { TypeBadge, ConfidencePill, StatusBadge } from "@/components/common/badges";
import { DraftReviewForm } from "./draft-review-form";
import { useAccounts } from "@/hooks/useAccounts";
import { tryParse } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  const [reason, setReason] = React.useState("");
  const isPending = draft.status === "PENDING";
  const p = draft.parsedData;
  const { data: accounts } = useAccounts("all");
  const accountName = (id?: string | null) => accounts?.find((a) => a.id === id)?.name;

  // Quick-approve skips the review form, so only allow it when everything the
  // ledger entry needs is present and the AI was reasonably sure.
  const needsAccounts =
    p.type === "EXPENSE" ? !p.fromAccountId
    : p.type === "INCOME" ? !p.toAccountId
    : p.type === "TRANSFER" ? !p.fromAccountId || !p.toAccountId
    : true;
  const lowConfidence = (tryParse(draft.confidenceScore)?.toNumber() ?? 0) < 0.5;
  const quickApproveBlocked = !p.amount || !p.currency || needsAccounts || lowConfidence;
  const blockedReason = !p.amount || !p.currency
    ? "Missing amount or currency"
    : needsAccounts
      ? "No account chosen"
      : "Low AI confidence";
  const fromName = accountName(p.fromAccountId);
  const toName = accountName(p.toAccountId);
  const accountSummary =
    p.type === "TRANSFER" ? [fromName, toName].every(Boolean) ? `${fromName} → ${toName}` : null
    : p.type === "INCOME" ? (toName ? `Into ${toName}` : null)
    : fromName ? `From ${fromName}` : null;

  return (
    <Card
      className={cn(
        "overflow-hidden border-0 p-0 shadow-sm transition-shadow",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2",
      )}
    >
      <div className="p-4">
        {/* Raw input quote */}
        <div className="flex items-start gap-2.5">
          <Quote className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
          <p className="flex-1 text-sm italic text-muted-foreground">
            “{draft.rawInput}”
          </p>
          {isPending ? (
            <ConfidencePill score={draft.confidenceScore} />
          ) : (
            <StatusBadge status={draft.status} />
          )}
        </div>

        {/* Parsed summary */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {p.type && <TypeBadge type={p.type} />}
          <span className="text-sm font-medium">{p.description}</span>
          {accountSummary && (
            <span className="text-xs text-muted-foreground">{accountSummary}</span>
          )}
          <span className="ml-auto text-xs text-muted-foreground tabular">
            {p.occurredAt ? formatDate(p.occurredAt) : formatDate(draft.createdAt)}
          </span>
          {p.amount && p.currency && (
            <MoneyAmount
              amount={p.type === "EXPENSE" ? `-${p.amount.replace(/^-/, "")}` : p.amount}
              currency={p.currency}
              colorBySign={p.type === "EXPENSE" || p.type === "INCOME"}
              className="text-base font-semibold"
            />
          )}
        </div>

        {/* PENDING actions */}
        {isPending && (
          <div className="mt-4 flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={approving || quickApproveBlocked}
              title={quickApproveBlocked ? `${blockedReason} — use Review & edit` : undefined}
              onClick={() => void Promise.resolve(onApprove?.(draft.id, {})).catch(() => {})}
            >
              <Check className="size-4" />
              Approve
            </Button>
            {quickApproveBlocked && (
              <span className="text-xs text-muted-foreground">{blockedReason} — review first</span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExpanded((v) => !v)}
              className="gap-1.5"
              aria-expanded={expanded}
            >
              <ChevronDown
                className={cn("size-4 transition-transform", expanded && "rotate-180")}
              />
              Review &amp; edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
              disabled={rejecting}
              onClick={() => setRejectOpen((v) => !v)}
            >
              <X className="size-4" />
              Reject
            </Button>
          </div>
        )}

        {/* Reject reason inline */}
        {isPending && rejectOpen && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg bg-secondary/60 p-3 sm:flex-row">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="bg-background"
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)}>
                Keep
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={rejecting}
                onClick={() => onReject?.(draft.id, reason.trim() || undefined)}
              >
                Reject draft
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Expandable review form */}
      {isPending && expanded && (
        <div className="px-4 pb-4">
          <DraftReviewForm
            draft={draft}
            approving={!!approving}
            onApprove={(edits) => onApprove?.(draft.id, edits)}
            onCancel={() => setExpanded(false)}
          />
        </div>
      )}

      {/* Rejected reason display */}
      {draft.status === "REJECTED" && draft.reason && (
        <div className="border-t border-border bg-secondary/30 px-4 py-2.5 text-xs text-muted-foreground">
          Reason: {draft.reason}
        </div>
      )}
    </Card>
  );
}
