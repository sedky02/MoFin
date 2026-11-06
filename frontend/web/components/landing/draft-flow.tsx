"use client";

import * as React from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "motion/react";
// Check marks are the app's own approve/done marks, as in the real UI. avoid-ai-design-ignore: I3
import { Check } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { AnthropicLogo } from "@/components/common/ai-logos";
import { MoneyAmount } from "@/components/common/money-amount";
import { cn } from "@/lib/utils";
import { ChatWindow, Composer, Reserve, Thinking, ToolChip, UserBubble } from "./chat-parts";
import { SPRING } from "./motion";
import { marksFromDelays, stageAtMarks, typedBetween } from "./chat-progress";

const QUESTION = "I just spent 12.50 on lunch at Panera, can you add it to MoFin?";
const REPLY = "Done. I've added it to MoFin as a draft: $12.50, Dining out, from Everyday checking. Approve it there and it's saved.";
const TOOL = "create_draft_transaction";

// The stages, 1 typing, 2 sent, 3 thinking, 4 tool call, 5 reply, 6 draft in MoFin, 7 approved, 8 in
// the ledger. These weights set how much of the scroll each one gets, in proportion.
const STAGES = [300, 1900, 500, 1200, 900, 2700, 1500, 800] as const;
const MARKS = marksFromDelays(STAGES);
const TYPING = 1;
const SENT = 2;
const THINKING = 3;
const TOOL_CALL = 4;
const REPLIED = 5;
const DRAFT = 6;
const APPROVED = 7;
const SAVED = 8;

const STEPS = [
  { title: "You ask", text: "Tell Claude or ChatGPT what you spent, or type it in MoFin. There's no form to fill in." },
  { title: "You check the draft", text: "It arrives in MoFin as a draft. Fix anything before it counts." },
  { title: "It's saved", text: "Approve it and it goes into your ledger, and every balance updates." },
];

// What the animation shows, for screen readers (the animation itself is hidden from them).
const DESCRIPTION =
  "In this example, someone asks Claude to add $12.50 for lunch at Panera. Claude uses MoFin's create_draft_transaction tool, the entry waits in MoFin as a draft, and once it's approved it goes into the ledger and the Everyday checking balance goes from $4,230.90 to $4,218.40.";

/**
 * How an entry really gets in: Claude calls create_draft_transaction and the draft waits in MoFin
 * until you approve it. On desktop the demo follows your scroll.
 */
export function HowItWorks() {
  const reduceMotion = Boolean(useReducedMotion());
  const track = React.useRef<HTMLDivElement>(null);
  const [progress, setProgress] = React.useState(0);

  // 0 as the demo is about to be pinned, 1 when its scroll runs out. Below a desktop width it isn't
  // pinned; it plays as it passes through the screen.
  const { scrollYProgress } = useScroll({ target: track, offset: ["start 0.6", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });
  useMotionValueEvent(smooth, "change", (v) => setProgress(Math.min(1, Math.max(0, v))));

  const stage = reduceMotion ? STAGES.length : stageAtMarks(progress, MARKS);
  const typed = stage === TYPING ? typedBetween(QUESTION, progress, MARKS[TYPING - 1], MARKS[SENT - 1]) : "";
  const replyEnd = MARKS[REPLIED - 1] + (MARKS[DRAFT - 1] - MARKS[REPLIED - 1]) * 0.8;
  const reply = reduceMotion ? REPLY : stage >= REPLIED ? typedBetween(REPLY, progress, MARKS[REPLIED - 1], replyEnd) : "";
  const activeStep = stage >= APPROVED ? 2 : stage >= DRAFT ? 1 : stage >= TYPING ? 0 : -1;

  return (
    <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
      <div className="lg:sticky lg:top-28">
        <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          From a sentence to your ledger
        </h2>
        <p className="mt-4 max-w-md text-muted-foreground">
          Claude writes the entry for you. You decide whether it&apos;s saved.
        </p>
        <p className="sr-only">{DESCRIPTION}</p>
        <ol className="mt-8 space-y-3">
          {STEPS.map((step, i) => {
            const active = i === activeStep;
            const done = i < activeStep;
            return (
              <li
                key={step.title}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex gap-4 rounded-2xl border p-4 transition-colors duration-300",
                  active ? "border-primary/40 bg-primary/8" : "border-transparent",
                )}
              >
                <span
                  className={cn(
                    "tabular flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-300",
                    active || done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Tall on a desktop, where the demo stays pinned while it plays (below the steps on phones). */}
      <div ref={track} aria-hidden className={cn(!reduceMotion && "lg:h-[320vh]")}>
        <div className={cn(!reduceMotion && "lg:sticky lg:top-20")}>
          <ChatWindow
            name="Claude"
            Logo={AnthropicLogo}
            badge="bg-[#d97757] text-white"
            composer={
              <Composer
                text={stage === TYPING ? typed : ""}
                full={QUESTION}
                typing={stage === TYPING}
                placeholder="Reply to Claude…"
              />
            }
          >
            <Reserve reserve={<Messages question reply={REPLY} slot="tool" toolDone />}>
              <Messages
                question={stage >= SENT}
                slot={stage === THINKING ? "think" : stage >= TOOL_CALL ? "tool" : "none"}
                toolDone={stage >= REPLIED}
                reply={stage >= REPLIED ? reply : ""}
              />
            </Reserve>
          </ChatWindow>

          <div className="flex h-12 items-center justify-center">
            <motion.div
              className="h-full w-px origin-top bg-gradient-to-b from-border to-primary"
              initial={{ scaleY: 0 }}
              animate={stage >= DRAFT ? { scaleY: 1 } : { scaleY: 0 }}
              transition={SPRING}
            />
          </div>

          <div className="overflow-hidden rounded-hero border border-border bg-card shadow-hero">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
              <LogoMark className="size-7" />
              <span className="text-sm font-semibold">MoFin</span>
              <span className="ml-auto text-xs text-muted-foreground">Drafts</span>
            </div>

            <div className="space-y-3 p-5">
              {/* Placeholder, draft and saved row all live in the draft card's space. */}
              <Reserve reserve={<DraftCard approved={false} />}>
                <AnimatePresence initial={false}>
                  {stage < DRAFT && (
                    <motion.p
                      key="waiting"
                      className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      Waiting for something to check…
                    </motion.p>
                  )}
                  {stage >= DRAFT && stage < SAVED && (
                    <motion.div
                      key="draft"
                      className="absolute inset-0"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={SPRING}
                    >
                      <DraftCard approved={stage >= APPROVED} />
                    </motion.div>
                  )}
                  {stage >= SAVED && (
                    <motion.div
                      key="saved"
                      className="absolute inset-0 flex items-center"
                      // The saved row arriving is the demo's state change, not a section reveal. avoid-ai-design-ignore: M1
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={SPRING}
                    >
                      <SavedRow />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Reserve>

              <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
                <span className="text-sm text-muted-foreground">Everyday checking</span>
                <span className="text-sm font-semibold">
                  <MoneyAmount amount={stage >= SAVED ? "4218.40" : "4230.90"} currency="USD" animate />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Messages({
  question,
  slot,
  toolDone,
  reply,
}: {
  question: boolean;
  slot: "none" | "think" | "tool";
  toolDone: boolean;
  reply: string;
}) {
  return (
    <div className="space-y-4">
      <div className={cn("transition-opacity duration-300", question ? "opacity-100" : "opacity-0")}>
        <UserBubble text={QUESTION} />
      </div>
      <div className="h-9">
        {slot === "think" && <Thinking dot="bg-[#d97757]" />}
        {slot === "tool" && (
          // The tool call appearing is part of the conversation. avoid-ai-design-ignore: M1
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
            <ToolChip verb="Used MoFin" tool={TOOL} done={toolDone} />
          </motion.div>
        )}
      </div>
      <p className="max-w-[92%] text-sm leading-relaxed">{reply}</p>
    </div>
  );
}

function DraftCard({ approved }: { approved: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Panera Bread</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">from Claude</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        {[
          ["Amount", "$12.50"],
          ["Category", "Dining out"],
          ["Account", "Checking"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-card px-2.5 py-2">
            <p className="text-muted-foreground">{label}</p>
            <p className="tabular mt-0.5 truncate font-medium">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <span className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground">Edit</span>
        <motion.span
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground"
          animate={approved ? { scale: [1, 0.94, 1] } : undefined}
          transition={{ duration: 0.28 }}
        >
          <Check className="size-3.5" />
          {/* Both labels take the wider one's width, so the button doesn't resize. */}
          <span className="grid">
            <span className={cn("[grid-area:1/1]", approved && "invisible")}>Approve</span>
            <span className={cn("[grid-area:1/1]", !approved && "invisible")}>Approved</span>
          </span>
        </motion.span>
      </div>
    </div>
  );
}

function SavedRow() {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-primary/10 px-4 py-3">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Panera Bread</p>
        <p className="text-xs text-muted-foreground">Dining out, today</p>
      </div>
      <span className="tabular text-sm font-semibold">−$12.50</span>
    </div>
  );
}
