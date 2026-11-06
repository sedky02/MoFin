"use client";

import * as React from "react";
import { CornerDownRight, Loader2, Sparkles } from "lucide-react";
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
import { writableAccounts } from "@/lib/account-sharing";
import { useActiveAccount } from "@/hooks/useActiveAccount";

// Example sentences, shown whole so it is plain what a click puts in the box.
const EXAMPLES = [
  "Spent 42.50 on groceries at the market yesterday",
  "Got paid 3200 salary into my bank account",
  "Moved 500 from checking to savings",
];

export function DraftComposer() {
  const [input, setInput] = React.useState("");
  const { accountId: activeAccountId } = useActiveAccount();
  // An explicit pick here overrides the app-wide active account for this composer only.
  const [pickedAccountId, setDefaultAccountId] = React.useState<string | undefined>();
  const defaultAccountId = pickedAccountId ?? activeAccountId;
  const { data: allAccounts } = useAccounts();
  const accounts = writableAccounts(allAccounts ?? []);
  const createIntent = useCreateDraftIntent();

  async function submit() {
    const text = input.trim();
    if (!text || createIntent.isPending) return;
    const account = accounts.find((a) => a.id === defaultAccountId);
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

  // Show the right shortcut hint per platform (resolved after mount: SSR can't know).
  const modKey = React.useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // ⌘/Ctrl + Enter submits.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div>
      {/* One box: the sentence on top, the account and the button along its bottom edge. */}
      <div className="rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe a transaction, e.g. Spent 42.50 on groceries yesterday"
          rows={3}
          className="resize-none rounded-2xl border-0 bg-transparent px-4 pb-1 pt-4 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          aria-label="Describe a transaction in plain language"
        />

        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
          <Select value={defaultAccountId} onValueChange={setDefaultAccountId}>
            <SelectTrigger
              size="sm"
              className="w-auto max-w-[55%] border-transparent bg-secondary/70 hover:bg-secondary"
              aria-label="Default account"
            >
              <SelectValue placeholder="Account (optional)" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2">
                    {a.name}
                    <span className="text-xs text-muted-foreground tabular">{a.currency}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={submit} disabled={!input.trim() || createIntent.isPending} className="shrink-0 gap-2">
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
                  {modKey}↵
                </kbd>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Suggestions, like the follow-ups under a chat answer: a return arrow and the sentence. A click fills the box in. */}
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
    </div>
  );
}
