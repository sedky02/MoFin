"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
// Check marks are the app's own approve/done marks, as in the real UI. avoid-ai-design-ignore: I3
import { Check, X } from "lucide-react";
import { MoneyAmount } from "@/components/common/money-amount";
import { cn } from "@/lib/utils";
import { SPRING, SPRING_SLOW } from "./motion";

const SAVED = 0.95;
const MILESTONES = [0.25, 0.5, 0.75];
const CONTRIBUTIONS = [38, 52, 44, 61, 70, 86]; // % of the tallest month
// Ring fill takes this long, so milestones light up as it passes them.
const RING_SECONDS = 1.6;

// Groceries, day by day this month, as % of the $600 limit.
const DAILY = [4, 6, 3, 9, 5, 7, 4, 8, 6, 5, 7, 4, 6, 5, 3, 2];
const SPENT_PCT = DAILY.reduce((a, b) => a + b, 0);

const HISTORY = [
  { month: "May", met: true },
  { month: "Jun", met: false },
  { month: "Jul", met: true },
  { month: "Aug", met: true },
  { month: "Sep", met: true },
  { month: "Oct", met: true },
];
// Months met in a row, counting back from the latest.
const STREAK = HISTORY.slice().reverse().findIndex((m) => !m.met);

/**
 * Goals as three cards: a savings goal filling up to its milestones, a
 * spending limit filling day by day, and a recurring goal's month-by-month
 * record. Each plays once as it scrolls into view.
 */
export function GoalsShowcase() {
  const ref = React.useRef<HTMLDivElement>(null);
  const play = useInView(ref, { once: true, amount: 0.3 });
  const reduceMotion = Boolean(useReducedMotion());

  return (
    <div ref={ref}>
      {/* The cards are illustrations; this is what they say. */}
      <ul className="sr-only">
        <li>A savings goal: emergency fund, $9,454 of $10,000 saved, about two more weeks at the current pace.</li>
        <li>A spending limit: groceries, $501.04 of $600 spent this month, $98.96 left with 9 days to go.</li>
        <li>A monthly goal: side income of $500 a month, met 4 months in a row, missed in June.</li>
      </ul>
      <div aria-hidden className="grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:grid-rows-2">
        <SavingsCard play={play} reduceMotion={reduceMotion} />
        <BudgetCard play={play} />
        <HistoryCard play={play} />
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-hero border border-border bg-card p-6 shadow-surface", className)}>
      {children}
    </div>
  );
}

function CardTitle({ title, kind }: { title: string; kind: string }) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{kind}</p>
    </div>
  );
}

function SavingsCard({ play, reduceMotion }: { play: boolean; reduceMotion: boolean }) {
  const size = 200;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const ringDelay = 0.2;

  return (
    <Card className="lg:row-span-2">
      <CardTitle title="Emergency fund" kind="Saving toward $10,000 across Checking and Savings" />

      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
            <motion.circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              className="stroke-primary"
              initial={{ pathLength: 0 }}
              animate={play ? { pathLength: SAVED } : undefined}
              transition={{ duration: reduceMotion ? 0 : RING_SECONDS, ease: [0.22, 1, 0.36, 1], delay: ringDelay }}
            />
            {MILESTONES.map((m) => {
              const angle = m * 2 * Math.PI;
              return (
                <motion.circle
                  key={m}
                  cx={c + r * Math.cos(angle)}
                  cy={c + r * Math.sin(angle)}
                  r={5}
                  className="fill-card stroke-primary"
                  strokeWidth={2.5}
                  initial={{ scale: 0.4, opacity: 0.3 }}
                  animate={play ? { scale: 1, opacity: 1 } : undefined}
                  transition={{ ...SPRING, delay: ringDelay + (reduceMotion ? 0 : (m / SAVED) * RING_SECONDS * 0.7) }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-semibold tracking-[-0.03em]">
              <MoneyAmount amount={play ? "9454" : "0"} currency="USD" animate />
            </span>
            <span className="text-xs text-muted-foreground">of $10,000</span>
          </div>
        </div>

        <div className="w-full flex-1">
          <motion.p
            className="text-sm font-semibold text-primary-text"
            initial={{ opacity: 0 }}
            animate={play ? { opacity: 1 } : undefined}
            transition={{ duration: 0.4, delay: ringDelay + RING_SECONDS }}
          >
            95% saved, on track
          </motion.p>
          <p className="mt-1 text-sm text-muted-foreground">
            About <span className="font-medium text-foreground">2 more weeks</span> at your current pace.
          </p>

          <p className="mt-6 label-sm">Saved each month</p>
          <div className="mt-2 flex h-20 items-end gap-2">
            {CONTRIBUTIONS.map((h, i) => (
              <motion.div
                key={i}
                className={cn("flex-1 origin-bottom rounded-md", i === CONTRIBUTIONS.length - 1 ? "bg-primary" : "bg-bar/60")}
                style={{ height: `${h}%` }}
                initial={{ scaleY: 0 }}
                animate={play ? { scaleY: 1 } : undefined}
                transition={{ ...SPRING_SLOW, delay: 0.5 + i * 0.07 }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>May</span>
            <span>Oct</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function BudgetCard({ play }: { play: boolean }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardTitle title="Groceries" kind="Spending limit of $600 a month" />
        <span className="text-xs text-muted-foreground">9 days left</span>
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <span className="text-2xl font-semibold tracking-[-0.02em]">
          <MoneyAmount amount={play ? "501.04" : "0"} currency="USD" animate />
        </span>
        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-primary-text">$98.96</span> left
        </span>
      </div>

      {/* Each day's spending stacks up toward the limit. */}
      <div className="relative mt-3 flex h-4 gap-0.5 overflow-hidden rounded-full bg-muted">
        {DAILY.map((pct, i) => (
          <motion.span
            key={i}
            className={cn("h-full origin-left", i === DAILY.length - 1 ? "bg-primary" : "bg-primary/70")}
            style={{ width: `${pct}%` }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={play ? { scaleX: 1, opacity: 1 } : undefined}
            transition={{ ...SPRING, delay: 0.3 + i * 0.06 }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>Oct 1</span>
        <span className="tabular">{SPENT_PCT}% used</span>
        <span>$600</span>
      </div>
    </Card>
  );
}

function HistoryCard({ play }: { play: boolean }) {
  const streak = STREAK === -1 ? HISTORY.length : STREAK;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardTitle title="Side income" kind="Earn $500 a month on the side" />
        <motion.span
          className="text-xs font-semibold text-primary-text"
          initial={{ opacity: 0 }}
          animate={play ? { opacity: 1 } : undefined}
          transition={{ duration: 0.4, delay: 0.3 + HISTORY.length * 0.12 }}
        >
          {streak} months in a row
        </motion.span>
      </div>

      <div className="mt-6 grid grid-cols-6 gap-2">
        {HISTORY.map((m, i) => (
          <div key={m.month} className="flex flex-col items-center gap-1.5">
            <motion.span
              className={cn(
                "flex aspect-square w-full max-w-11 items-center justify-center rounded-xl",
                m.met ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
              initial={{ opacity: 0, scale: 0.6, y: 8 }}
              animate={play ? { opacity: 1, scale: 1, y: 0 } : undefined}
              transition={{ ...SPRING, delay: 0.3 + i * 0.12 }}
            >
              {m.met ? <Check className="size-4" /> : <X className="size-4" />}
            </motion.span>
            <span className="text-[11px] text-muted-foreground">{m.month}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
