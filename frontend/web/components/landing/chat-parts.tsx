"use client";

import { motion } from "motion/react";
// Check marks are the app's own approve/done marks, as in the real UI. avoid-ai-design-ignore: I3
import { ArrowUp, Check, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnthropicLogo } from "@/components/common/ai-logos";

/**
 * Keeps a box at the size of its largest state. `reserve` is rendered
 * invisibly in the same grid cell as the live content, so the box is exactly
 * as tall as that state at every width, and whatever appears or swaps inside
 * never pushes the page around.
 */
export function Reserve({
  reserve,
  children,
  className,
}: {
  reserve: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid", className)}>
      <div className="invisible [grid-area:1/1]" aria-hidden>
        {reserve}
      </div>
      <div className="relative [grid-area:1/1]">{children}</div>
    </div>
  );
}

export function ChatWindow({
  name,
  Logo,
  badge,
  composer,
  children,
  className,
}: {
  name: string;
  Logo: typeof AnthropicLogo;
  badge: string;
  composer: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  // A column, so a window stretched to a taller space keeps its composer at the bottom.
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-hero border border-border bg-card shadow-hero", className)}>
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
        <span className={cn("flex size-7 items-center justify-center rounded-lg", badge)}>
          <Logo className="size-4" />
        </span>
        <span className="text-sm font-semibold">{name}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary-text">
          <span className="size-1.5 rounded-full bg-primary" />
          MoFin connected
        </span>
      </div>
      <div className="flex-1 p-5">{children}</div>
      <div className="border-t border-border p-3">{composer}</div>
    </div>
  );
}

/** The message as the user sends it: whole, on the right. */
export function UserBubble({ text }: { text: string }) {
  return (
    <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm">{text}</div>
  );
}

/**
 * The text box at the bottom of the chat. The question is typed here, left to
 * right like any text field, then sent as one message.
 */
export function Composer({
  text,
  full,
  typing,
  placeholder,
}: {
  /** What's typed so far ("" once sent). */
  text: string;
  /** The whole message, to keep the box at its final height while typing. */
  full: string;
  typing: boolean;
  placeholder: string;
}) {
  const ready = text.length > 0;
  return (
    <div className="flex items-end gap-2 rounded-2xl border border-border bg-background/60 py-2 pr-2 pl-4">
      <Reserve reserve={<p className="py-1 text-sm">{full}</p>} className="min-w-0 flex-1">
        <p className={cn("py-1 text-sm", !ready && "text-muted-foreground")}>
          {ready ? text : placeholder}
          {typing && (
            <motion.span
              className="ml-px inline-block h-4 w-px translate-y-0.5 bg-foreground"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.9, repeat: Infinity }}
            />
          )}
        </p>
      </Reserve>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
          ready ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <ArrowUp className="size-4" />
      </span>
    </div>
  );
}

export function Thinking({ dot }: { dot: string }) {
  return (
    <div className="flex h-full items-center gap-1.5 px-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn("size-1.5 rounded-full", dot)}
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function ToolChip({ verb, tool, done }: { verb: string; tool: string; done: boolean }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs">
      <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{verb}</span>
      <span className="truncate font-mono font-medium">{tool}</span>
      <Check className={cn("size-3.5 shrink-0 text-primary-text transition-opacity", done ? "opacity-100" : "opacity-0")} />
    </div>
  );
}
