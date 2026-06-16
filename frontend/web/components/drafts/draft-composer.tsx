"use client";

import * as React from "react";
import { Sparkles, Loader2, CornerDownLeft } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDraftIntent } from "@/hooks/useDrafts";
import { useAccounts } from "@/hooks/useAccounts";

const EXAMPLES = [
  "Spent 42.50 on groceries at the market yesterday",
  "Got paid 3200 salary into my bank account",
  "Moved 500 from checking to savings",
];

export function DraftComposer() {
  const [input, setInput] = React.useState("");
  const [defaultAccountId, setDefaultAccountId] = React.useState<string | undefined>();
  const { data: accounts } = useAccounts();
  const createIntent = useCreateDraftIntent();

  async function submit() {
    const text = input.trim();
    if (!text || createIntent.isPending) return;
    const account = accounts?.find((a) => a.id === defaultAccountId);
    try {
      await createIntent.mutateAsync({
        input: text,
        defaultAccountId,
        defaultCurrency: account?.currency,
      });
      setInput("");
    } catch {
      /* hook toasts */
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // ⌘/Ctrl + Enter submits.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
      {/* atmospheric accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight">Describe a transaction</h2>
            <p className="text-xs text-muted-foreground">
              MoFin drafts it — you review before anything is recorded.
            </p>
          </div>
        </div>

        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. Spent 42.50 on groceries yesterday"
          rows={3}
          className="resize-none bg-background text-base"
          aria-label="Describe a transaction in plain language"
        />

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Select
            value={defaultAccountId}
            onValueChange={setDefaultAccountId}
          >
            <SelectTrigger className="h-9 w-full sm:w-56" aria-label="Default account">
              <SelectValue placeholder="Default account (optional)" />
            </SelectTrigger>
            <SelectContent>
              {(accounts ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2">
                    {a.name}
                    <span className="text-xs text-muted-foreground tabular">{a.currency}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={submit} disabled={!input.trim() || createIntent.isPending} className="gap-2">
            {createIntent.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Parsing…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Draft it
                <kbd className="ml-1 hidden rounded bg-primary-foreground/20 px-1.5 text-[10px] sm:inline-flex">
                  ⌘↵
                </kbd>
              </>
            )}
          </Button>
        </div>

        {/* Quick examples */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setInput(ex)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
