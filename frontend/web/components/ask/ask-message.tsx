"use client";

import * as React from "react";
import { AlertCircle, Check, Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AskChart } from "@/components/ask/ask-chart";
import { ChatDraftCards } from "@/components/ask/chat-draft-cards";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AiChatMessage } from "@/lib/types";

// The server sends the tool names it read from; show them as plain labels.
export const TOOL_LABELS: Record<string, string> = {
  search_transactions: "transactions",
  get_balance: "balances",
  get_monthly_summary: "monthly summary",
  list_accounts: "accounts",
  list_goals: "goals",
  get_goal: "goal",
  get_goal_history: "goal history",
  list_categories: "categories",
  chart_spending_by_category: "spending by category",
  chart_income_vs_expenses: "monthly totals",
  chart_daily_trend: "daily activity",
};

/** `**bold**` inside a line; everything else stays text (React escapes it). */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

/**
 * The little formatting the assistant is asked to use: paragraphs, "- " bullets,
 * "1." lists and **bold**. Rendered as React nodes, never as HTML, so nothing a
 * model writes can inject markup.
 */
export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, b) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => BULLET.test(l))) {
          return (
            <ul key={b} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(BULLET, ""))}</li>
              ))}
            </ul>
          );
        }
        if (lines.length && lines.every((l) => NUMBERED.test(l))) {
          return (
            <ol key={b} className="list-decimal space-y-1 pl-5 marker:text-muted-foreground">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(NUMBERED, ""))}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={b}>
            {lines.map((l, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                {BULLET.test(l) ? <>• {inline(l.replace(BULLET, ""))}</> : inline(l)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** MoFin's own mark (the bar M) next to its answers, so it's plain who is speaking. */
function AssistantAvatar() {
  return <LogoMark className="mt-0.5 size-8" />;
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

export function UserMessage({ content, createdAt }: { content: string; createdAt?: string }) {
  return (
    <li className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[75%]">
        <div className="whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-[0.9375rem] text-primary-foreground">
          <span className="sr-only">You: </span>
          {content}
        </div>
        {createdAt && <p className="mt-1 pr-1 text-right text-[11px] text-muted-foreground">{time(createdAt)}</p>}
      </div>
    </li>
  );
}

export function AssistantMessage({ message }: { message: AiChatMessage }) {
  // Charts and drafts show themselves below; this line is for what was read.
  const tools = message.usedTools.filter((t) => !t.startsWith("chart_") && t !== "create_draft_transaction");
  return (
    <li className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="text-[0.9375rem] leading-relaxed">
          <span className="sr-only">MoFin: </span>
          <RichText text={message.content} />
        </div>
        {message.charts.length > 0 && (
          <div className="grid gap-3">
            {message.charts.map((chart, i) => (
              <AskChart key={`${chart.title}-${i}`} chart={chart} />
            ))}
          </div>
        )}
        <ChatDraftCards drafts={message.drafts ?? []} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          <span>{time(message.createdAt)}</span>
          {tools.length > 0 && (
            <span className="flex flex-wrap items-center gap-1">
              Looked at
              {tools.map((t) => (
                <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
                  {TOOL_LABELS[t] ?? t}
                </span>
              ))}
            </span>
          )}
          <CopyAnswer text={message.content} />
        </div>
      </div>
    </li>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text to copy it.");
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy answer"}
      className="-my-1 text-muted-foreground pointer-coarse:size-9"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

/** Shown while the answer is on its way: the assistant reads data for a few seconds. */
export function ThinkingMessage() {
  return (
    <li className="flex gap-3" aria-hidden>
      <AssistantAvatar />
      <div className="flex items-center gap-2 rounded-3xl rounded-tl-lg bg-secondary px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 motion-reduce:animate-none"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
        <span className="ml-1 text-sm text-muted-foreground">Looking at your data…</span>
      </div>
    </li>
  );
}

/** The answer failed: say why, and offer the same question again. */
export function FailedMessage({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"
      >
        <AlertCircle className="size-4" />
      </span>
      <div
        role="alert"
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm",
          "sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <p>{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0 gap-1.5 self-start sm:self-auto">
          <RotateCcw className="size-3.5" aria-hidden />
          Try again
        </Button>
      </div>
    </li>
  );
}
