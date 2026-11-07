"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
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
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div>
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
    </div>
  );
}
