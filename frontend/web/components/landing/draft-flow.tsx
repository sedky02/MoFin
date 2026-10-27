"use client";

import * as React from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { Check, RotateCcw } from "lucide-react";
import { SPRING } from "./motion";

const SENTENCE = "Spent 12.50 on lunch at Panera";
const TYPE_MS = 45;

type Step = "idle" | "typing" | "draft" | "saved";

const LEDGER = [
  { name: "Shake Shack", meta: "Dining out · Yesterday", amount: "−$14.61" },
  { name: "Salary", meta: "Income · Oct 1", amount: "+$3,200.00", income: true },
];

/**
 * The draft flow in miniature: a sentence is typed, MoFin turns it into a
 * draft, and only after "Approve" does it reach the ledger. Plays once when
 * scrolled into view; with reduced motion it shows the finished state.
 */
export function DraftFlow() {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduceMotion = useReducedMotion();
  const [step, setStep] = React.useState<Step>("idle");
  const [typed, setTyped] = React.useState(0);
  const [run, setRun] = React.useState(0);

  React.useEffect(() => {
    // With reduced motion the finished state is shown directly (see below).
    if (!inView || reduceMotion) return;
    let chars = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const typer = setInterval(() => {
      chars += 1;
      setTyped(chars);
      if (chars === 1) setStep("typing");
      if (chars >= SENTENCE.length) {
        clearInterval(typer);
        timers.push(setTimeout(() => setStep("draft"), 450));
        timers.push(setTimeout(() => setStep("saved"), 2200));
      }
    }, TYPE_MS);
    return () => {
      clearInterval(typer);
      timers.forEach(clearTimeout);
    };
  }, [inView, reduceMotion, run]);

  const finished = Boolean(reduceMotion && inView);
  const current: Step = finished ? "saved" : step;
  const shownChars = finished ? SENTENCE.length : typed;
  const showDraft = current === "draft" || current === "saved";
  const saved = current === "saved";

  function replay() {
    setTyped(0);
    setStep("typing");
    setRun((n) => n + 1);
  }

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-md">
      <div aria-hidden className="space-y-3">
      {/* What you said */}
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
        {SENTENCE.slice(0, shownChars) || " "}
        {current === "typing" && <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-current" />}
      </div>

      {/* What MoFin understood */}
      <AnimatePresence>
        {showDraft && (
          <motion.div
            key="draft"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            className="rounded-card border border-border bg-card p-4 shadow-surface"
          >
            <div className="flex items-center justify-between">
              <span className="label-sm">Draft · check it</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">from your words</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="tabular text-right font-semibold">$12.50</dd>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="text-right">Dining out</dd>
              <dt className="text-muted-foreground">Account</dt>
              <dd className="text-right">Everyday checking</dd>
            </dl>
            <div className="mt-4 flex justify-end gap-2">
              <span className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground">Edit</span>
              <motion.span
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                animate={saved ? { scale: [1, 0.95, 1] } : undefined}
                transition={{ duration: 0.25 }}
              >
                <Check className="size-3.5" />
                {saved ? "Approved" : "Approve"}
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The ledger */}
      <div className="rounded-card border border-border bg-card p-2 shadow-surface">
        <ul>
          <AnimatePresence initial={false}>
            {saved && (
              <motion.li
                key="new"
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={SPRING}
                className="overflow-hidden"
              >
                <Row name="Panera Bread" meta="Dining out · Today" amount="−$12.50" fresh />
              </motion.li>
            )}
          </AnimatePresence>
          {LEDGER.map((row) => (
            <motion.li key={row.name} layout transition={SPRING}>
              <Row {...row} />
            </motion.li>
          ))}
        </ul>
      </div>
      </div>

      {saved && !reduceMotion && (
        <button
          type="button"
          onClick={replay}
          className="mx-auto mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Play again
        </button>
      )}
    </div>
  );
}

function Row({
  name,
  meta,
  amount,
  income,
  fresh,
}: {
  name: string;
  meta: string;
  amount: string;
  income?: boolean;
  fresh?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <span
        className={
          fresh
            ? "flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
            : "flex size-8 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
        }
      >
        {fresh ? <Check className="size-4" /> : name[0]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      <span className={income ? "tabular text-sm font-semibold text-success" : "tabular text-sm font-semibold"}>
        {amount}
      </span>
    </div>
  );
}
