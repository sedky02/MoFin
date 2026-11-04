"use client";

import * as React from "react";
import { CornerDownRight, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { chatErrorMessage, useAiChat } from "@/hooks/useAiChat";
import type { AiChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

// Whole sentences, so it is plain what a click puts in the box.
const EXAMPLES = [
  "How much did I spend on food this month?",
  "Compare my spending this month with last month",
  "Am I on track with my goals?",
];

// The server sends the tool names it read from; show them as plain labels.
const TOOL_LABELS: Record<string, string> = {
  search_transactions: "transactions",
  get_balance: "balances",
  get_monthly_summary: "monthly summary",
  list_accounts: "accounts",
  list_goals: "goals",
  get_goal: "goal",
  get_goal_history: "goal history",
  list_categories: "categories",
};

interface Turn extends AiChatMessage {
  usedTools?: string[];
}

export function DraftChat() {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const chat = useAiChat();
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns.length, chat.isPending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || chat.isPending) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setInput("");
    setError(null);
    try {
      const reply = await chat.mutateAsync(next.map(({ role, content: c }) => ({ role, content: c })));
      setTurns([...next, { role: "assistant", content: reply.message, usedTools: reply.usedTools }]);
    } catch (err) {
      setError(chatErrorMessage(err));
      // Give the question back so a retry is one keypress.
      setTurns(turns);
      setInput(content);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter makes a new line. Not while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <div>
      {turns.length > 0 && (
        <ol aria-label="Conversation" className="mb-4 space-y-3">
          {turns.map((turn, i) => (
            <li key={i} className={cn("flex", turn.role === "user" && "justify-end")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[0.9375rem]",
                  turn.role === "user" ? "bg-primary text-primary-foreground" : "bg-card shadow-sm",
                )}
              >
                <span className="sr-only">{turn.role === "user" ? "You: " : "MoFin: "}</span>
                {turn.content}
                {turn.usedTools && turn.usedTools.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Looked at: {turn.usedTools.map((t) => TOOL_LABELS[t] ?? t).join(", ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Announced politely: the answer arrives after a few seconds. */}
      <div role="status" aria-live="polite" className="mb-3 min-h-0">
        {chat.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Looking at your data…
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about your spending, e.g. How much did I spend on food last month?"
          rows={2}
          maxLength={2000}
          className="resize-none rounded-2xl border-0 bg-transparent px-4 pb-1 pt-4 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          aria-label="Ask a question about your finances"
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden />
            Reads your data. Never changes it.
          </p>
          <Button onClick={() => void send(input)} disabled={!input.trim() || chat.isPending} className="shrink-0 gap-2">
            <Send className="size-4" aria-hidden />
            Ask
          </Button>
        </div>
      </div>

      {turns.length === 0 && (
        <ul aria-label="Examples" className="mt-4 divide-y divide-border/60">
          {EXAMPLES.map((text) => (
            <li key={text}>
              <button
                type="button"
                onClick={() => setInput(text)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-muted-foreground transition-colors pointer-coarse:min-h-11 hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CornerDownRight className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={endRef} />
    </div>
  );
}
