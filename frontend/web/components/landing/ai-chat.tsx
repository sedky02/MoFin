"use client";

import * as React from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "motion/react";
import { AnthropicLogo, OpenAILogo } from "@/components/common/ai-logos";
import { cn } from "@/lib/utils";
import { ChatWindow, Composer, Reserve, Thinking, ToolChip, UserBubble } from "./chat-parts";
import { SPRING, SPRING_SLOW } from "./motion";
import { ANSWERED, CARD, SENT, THINKING, TOOL_CALL, TYPING, chatFrame } from "./chat-progress";
import { useSequence, useTypewriter } from "./use-sequence";

type Assistant = {
  key: "claude" | "chatgpt";
  name: string;
  Logo: typeof AnthropicLogo;
  badge: string;
  dot: string;
  placeholder: string;
  question: string;
  tool: string;
  answer: string;
  card: "spending" | "goal";
  /** What the conversation shows, for screen readers (the chat itself is hidden from them). */
  summary: string;
};

const ASSISTANTS: Assistant[] = [
  {
    key: "claude",
    name: "Claude",
    Logo: AnthropicLogo,
    badge: "bg-[#d97757] text-white",
    dot: "bg-[#d97757]",
    placeholder: "Reply to Claude…",
    question: "How much did I spend on food this month?",
    tool: "get_monthly_summary",
    answer: "$612.40 on food so far in October, 12% less than September. Most of it was groceries.",
    card: "spending",
    summary:
      "Claude is asked how much was spent on food this month. It reads MoFin's monthly summary and answers $612.40 so far in October, 12% less than September: $501.04 on groceries and $111.36 eating out.",
  },
  {
    key: "chatgpt",
    name: "ChatGPT",
    Logo: OpenAILogo,
    badge: "bg-foreground text-background",
    dot: "bg-foreground",
    placeholder: "Ask anything",
    question: "Am I on track for my emergency fund?",
    tool: "get_goal",
    answer: "Yes. $9,454 of $10,000 saved, 95% of the way. At this pace you'll get there in about two weeks.",
    card: "goal",
    summary:
      "ChatGPT is asked whether the emergency fund is on track. It reads the goal from MoFin and answers yes: $9,454 of $10,000 saved, about two weeks to go at the current pace.",
  },
];

// Timed conversation (ChatGPT's), as the delay before each stage (ms): 1 typing, 2 sent, 3 thinking,
// 4 tool call, 5 answer, 6 card.
const STAGES = [300, 1500, 500, 1100, 800, 1500] as const;

/**
 * Scrolling plays Claude's conversation while the section stays pinned; ChatGPT's plays on its own
 * timer.
 */
export function AiChat() {
  const reduceMotion = Boolean(useReducedMotion());
  const track = React.useRef<HTMLDivElement>(null);
  const [progress, setProgress] = React.useState(0);
  const [active, setActive] = React.useState(0);
  const [round, setRound] = React.useState(0);

  const { scrollYProgress } = useScroll({ target: track, offset: ["start 0.6", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });
  useMotionValueEvent(smooth, "change", (v) => setProgress(Math.min(1, Math.max(0, v))));

  function pick(i: number) {
    setActive(i);
    setRound((n) => n + 1);
  }

  return (
    <div ref={track} className={cn("mx-auto w-full max-w-xl", !reduceMotion && "h-[240vh]")}>
      <div className={cn(!reduceMotion && "sticky top-20 lg:top-28")}>
        <div
          role="group"
          aria-label="Show a conversation with"
          className="mb-4 inline-flex rounded-xl border border-border bg-card p-1 shadow-surface"
        >
          {ASSISTANTS.map((a, i) => (
            <button
              key={a.key}
              type="button"
              aria-pressed={i === active}
              onClick={() => pick(i)}
              className={cn(
                "relative inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors",
                i === active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {i === active && (
                <motion.span layoutId="ai-tab" className="absolute inset-0 rounded-lg bg-muted" transition={SPRING} />
              )}
              <span className={cn("relative flex size-5 items-center justify-center rounded-md", a.badge)}>
                <a.Logo className="size-3" />
              </span>
              <span className="relative">{a.name}</span>
            </button>
          ))}
        </div>

        <Reserve
          reserve={
            <div className="grid">
              {ASSISTANTS.map((a) => (
                <div key={a.key} className="[grid-area:1/1]">
                  <ConversationView assistant={a} stage={CARD} typed="" answer={a.answer} />
                </div>
              ))}
            </div>
          }
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={active === 0 ? "claude" : `chatgpt-${round}`}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {active === 0 ? (
                <ScrollConversation assistant={ASSISTANTS[0]} q={reduceMotion ? 1 : progress} />
              ) : (
                <TimedConversation assistant={ASSISTANTS[1]} />
              )}
            </motion.div>
          </AnimatePresence>
        </Reserve>

        <p className="sr-only" aria-live="polite">
          {ASSISTANTS[active].summary}
        </p>
      </div>
    </div>
  );
}

function ScrollConversation({ assistant: a, q }: { assistant: Assistant; q: number }) {
  const { stage, typed, answer } = chatFrame(q, a.question, a.answer);
  return <ConversationView assistant={a} stage={stage} typed={typed} answer={answer} />;
}

function TimedConversation({ assistant: a }: { assistant: Assistant }) {
  const reduceMotion = Boolean(useReducedMotion());
  const [stage] = useSequence(STAGES, true, reduceMotion);
  const typed = useTypewriter(a.question, stage >= TYPING, reduceMotion, 30);
  const answer = useTypewriter(a.answer, stage >= ANSWERED, reduceMotion, 14);
  return <ConversationView assistant={a} stage={stage} typed={typed} answer={stage >= ANSWERED ? answer : ""} />;
}

function ConversationView({
  assistant: a,
  stage,
  typed,
  answer,
}: {
  assistant: Assistant;
  stage: number;
  typed: string;
  answer: string;
}) {
  return (
    <div aria-hidden className="h-full">
      <ChatWindow
        className="h-full"
        name={a.name}
        Logo={a.Logo}
        badge={a.badge}
        composer={
          <Composer
            text={stage === TYPING ? typed : ""}
            full={a.question}
            typing={stage === TYPING}
            placeholder={a.placeholder}
          />
        }
      >
        <div className="space-y-4">
          <div className={cn("transition-opacity duration-300", stage >= SENT ? "opacity-100" : "opacity-0")}>
            <UserBubble text={a.question} />
          </div>
          <div className="h-9">
            {stage === THINKING && <Thinking dot={a.dot} />}
            {stage >= TOOL_CALL && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
                <ToolChip verb="Read from MoFin" tool={a.tool} done={stage >= ANSWERED} />
              </motion.div>
            )}
          </div>
          <Reserve reserve={<p className="max-w-[92%] text-sm leading-relaxed">{a.answer}</p>}>
            <p className="max-w-[92%] text-sm leading-relaxed">{answer}</p>
          </Reserve>
          <motion.div
            className="rounded-2xl border border-border bg-background/60 p-4"
            initial={false}
            animate={stage >= CARD ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={SPRING}
          >
            {a.card === "spending" ? <SpendingCard show={stage >= CARD} /> : <GoalCard show={stage >= CARD} />}
          </motion.div>
        </div>
      </ChatWindow>
    </div>
  );
}

const FOOD = [
  { name: "Groceries", amount: "$501.04", pct: 82 },
  { name: "Dining out", amount: "$111.36", pct: 18 },
];

function SpendingCard({ show }: { show: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label-sm">Food in October</span>
        <span className="text-xs font-medium text-primary-text">−12% vs September</span>
      </div>
      <p className="tabular mt-1 text-2xl font-semibold tracking-[-0.02em]">$612.40</p>
      <div className="mt-3 space-y-2.5">
        {FOOD.map((row, i) => (
          <div key={row.name}>
            <div className="flex justify-between text-xs">
              <span>{row.name}</span>
              <span className="tabular text-muted-foreground">{row.amount}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={cn("h-full origin-left rounded-full", i === 0 ? "bg-primary" : "bg-bar")}
                style={{ width: `${row.pct}%` }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: show ? 1 : 0 }}
                transition={{ ...SPRING_SLOW, delay: show ? 0.15 + i * 0.1 : 0 }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalCard({ show }: { show: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label-sm">Emergency fund</span>
        <span className="text-xs font-medium text-primary-text">On track</span>
      </div>
      <p className="tabular mt-1 text-2xl font-semibold tracking-[-0.02em]">
        $9,454 <span className="text-sm font-normal text-muted-foreground">of $10,000</span>
      </p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full origin-left rounded-full bg-primary"
          style={{ width: "95%" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: show ? 1 : 0 }}
          transition={{ ...SPRING_SLOW, delay: show ? 0.15 : 0 }}
        />
      </div>
      <div className="tabular mt-2 flex justify-between text-xs text-muted-foreground">
        <span>$546 to go</span>
        <span>about 2 weeks at this pace</span>
      </div>
    </div>
  );
}
