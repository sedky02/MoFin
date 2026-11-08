"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo";
import { AnthropicLogo, OpenAILogo } from "@/components/common/ai-logos";

// Each prompt sits on its app's own tile, so the switch between them reads at a glance.
const SOURCE_STYLE: Record<HeroExample["source"], string> = {
  MoFin: "bg-primary/15",
  Claude: "bg-[#D97757]/15 text-[#C2603F]",
  ChatGPT: "bg-foreground/[0.07] text-foreground",
};

function SourceLogo({ source }: { source: HeroExample["source"] }) {
  if (source === "MoFin") return <LogoMark className="size-5" />;
  const Logo = source === "Claude" ? AnthropicLogo : OpenAILogo;
  return <Logo className="size-[18px]" />;
}

/** One loop of the hero demo: where it was typed, what was said, and the draft MoFin made from it. */
export interface HeroExample {
  /** Where it was said: MoFin's own box, or an assistant MoFin is connected to. */
  source: "MoFin" | "Claude" | "ChatGPT";
  said: string;
  category: string;
  amount: string;
}

export const HERO_EXAMPLES: readonly HeroExample[] = [
  {
    source: "MoFin",
    said: "coffee with Sam, 4.50",
    category: "Dining out",
    amount: "−$4.50",
  },
  {
    source: "Claude",
    said: "log that I paid rent, 950, yesterday",
    category: "Rent",
    amount: "−$950.00",
  },
  {
    source: "ChatGPT",
    said: "add 1200 from the freelance job",
    category: "Freelance",
    amount: "+$1,200.00",
  },
];

const TYPE_MS = 45;
const HOLD_MS = 2600;
/** How long the empty prompt shows before typing starts, so the assistant's name can be read. */
const PAUSE_MS = 700;

/**
 * Drives the loop: types the sentence, holds the result, moves to the next example. With reduced
 * motion it rests on the first example, finished.
 */
export function useHeroLoop() {
  const reduce = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [typed, setTyped] = React.useState(reduce ? HERO_EXAMPLES[0].said.length : 0);
  const example = HERO_EXAMPLES[index];
  const done = typed >= example.said.length;

  React.useEffect(() => {
    if (reduce) return;
    const timer = window.setTimeout(
      () => {
        if (!done) setTyped((n) => n + 1);
        else {
          setIndex((i) => (i + 1) % HERO_EXAMPLES.length);
          setTyped(0);
        }
      },
      done ? HOLD_MS : typed === 0 ? PAUSE_MS : TYPE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [typed, done, reduce]);

  return { example, typed, done, reduce: !!reduce };
}

/** The sentence typing itself, then the category and amount MoFin read from it. */
export function HeroSentence({ example, typed, done, reduce }: ReturnType<typeof useHeroLoop>) {
  return (
    <div
      aria-hidden
      className="mt-10 flex w-full max-w-2xl flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex h-14 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-border bg-card pr-2 pl-2.5 text-left shadow-surface">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={example.source}
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", SOURCE_STYLE[example.source])}
          >
            <SourceLogo source={example.source} />
          </motion.span>
        </AnimatePresence>
        <span className="min-w-0 flex-1 truncate text-[15px]">
          {typed === 0 ? (
            <span className="text-muted-foreground">Message {example.source}…</span>
          ) : (
            example.said.slice(0, typed)
          )}
          {!done && <span className="ml-px inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-foreground" />}
        </span>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
            done ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}
        >
          <ArrowUp className="size-4" />
        </span>
      </div>
      <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" />
      <div className="relative h-14 sm:w-52">
        <AnimatePresence mode="wait">
          {done && (
            <motion.div
              key={example.said}
              initial={reduce ? false : { opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="absolute inset-0 flex items-center justify-between gap-3 rounded-2xl bg-primary/15 px-4"
            >
              <span className="min-w-0 text-left">
                <span className="block text-[11px] font-medium text-primary-text">Draft</span>
                <span className="block truncate text-sm font-medium">{example.category}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular">{example.amount}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
