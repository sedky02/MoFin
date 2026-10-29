"use client";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/common/submit-button";

/**
 * "You have unsaved changes" with Discard and Save. Rendered inside the settings
 * form (the Save button submits it) but fixed to the bottom of the screen, not
 * sticky: the form ends after Preferences, so a sticky bar would be left behind
 * between the cards. It is centred over the content column (the sidebar takes
 * 16rem from lg up) and lifted above the mobile bottom bar.
 */
export function SaveBar({ onDiscard }: { onDiscard: () => void }) {
  return (
    <div
      role="status"
      data-slot="save-bar"
      /* avoid-ai-design-ignore: K3 (a bar floating over scrolling content is real layering) */
      className="fixed bottom-20 left-1/2 z-30 flex w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md lg:bottom-6 lg:left-[calc(8rem+50vw)]"
    >
      <p className="text-sm">You have unsaved changes.</p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </div>
  );
}
