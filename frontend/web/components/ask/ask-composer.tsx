"use client";

import * as React from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const MAX_QUESTION_CHARS = 2000;

/** The question box: grows with the text, Enter sends, Shift+Enter makes a new line. */
export function AskComposer({
  value,
  onChange,
  onSend,
  pending,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  pending: boolean;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}) {
  const left = MAX_QUESTION_CHARS - value.length;
  const canSend = value.trim().length > 0 && !pending;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Not while an IME is composing a character.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
      // The whole field is the target: a click anywhere on it focuses the box.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) e.currentTarget.querySelector("textarea")?.focus();
      }}
      // One row, docked into the card: a filled field with no border or shadow of its own that
      // lifts to white with a ring while you type. 10px corners on phones (6px inside the card's
      // 16px), 12px on wider screens where it sits clear of the card's corners.
      className="flex items-end gap-2 rounded-[0.625rem] bg-secondary/70 p-1.5 ring-1 ring-transparent transition-[background-color,box-shadow] focus-within:bg-card focus-within:shadow-surface focus-within:ring-ring/50 sm:rounded-[0.75rem]"
    >
      <Textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about your money…"
        rows={1}
        maxLength={MAX_QUESTION_CHARS}
        aria-label="Ask a question about your finances"
        className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none rounded-none border-0 bg-transparent px-2.5 py-1.5 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      {/* Only near the limit: the box stays one clean line otherwise. */}
      {left <= 200 && (
        <span className={cn("self-center text-xs text-muted-foreground tabular", left <= 0 && "text-destructive")}>
          {left} left
        </span>
      )}
      <Button
        type="submit"
        size="icon"
        disabled={!canSend}
        aria-label={pending ? "Answering…" : "Send question"}
        // 6px inside the field, so its corners are the field's minus 6 (4px on phones, 6px wider).
        className="size-9 shrink-0 rounded-[0.25rem] transition-transform duration-100 active:scale-95 motion-reduce:active:scale-100 sm:rounded-[0.375rem] pointer-coarse:size-11"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
      </Button>
    </form>
  );
}
