"use client";

import { motion } from "motion/react";
import { MoneyAmount } from "@/components/common/money-amount";
import { cn } from "@/lib/utils";
import { SPRING, SPRING_SLOW } from "../motion";

const MONTHS = [
  { label: "May", height: 46 },
  { label: "Jun", height: 48 },
  { label: "Jul", height: 47 },
  { label: "Aug", height: 58 },
  { label: "Sep", height: 74 },
  { label: "Oct", height: 100 },
];

const GOALS = [
  { name: "Emergency fund", progress: 95 },
  { name: "Groceries budget", progress: 84 },
  { name: "Side income", progress: 100 },
];

/**
 * A miniature of the dashboard: the balance counts up on the app's own spring, bars grow, the
 * current month is marked "Now". Plays when `play` turns true.
 */
export function MockDashboard({ play, compact = false }: { play: boolean; compact?: boolean }) {
  return (
    <div className={cn("grid gap-4 p-4 sm:p-6", !compact && "md:grid-cols-[1.6fr_1fr]")}>
      <div className="rounded-card bg-background/60 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary-text">USD</span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">Balance</span>
        </div>
        <div className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          <MoneyAmount amount={play ? "14930.75" : "0"} currency="USD" animate />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Across all USD accounts</p>
        <span className="mt-2 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary-text">
          +$2,551.15 this month
        </span>

        <div className="mt-5 flex h-28 items-end gap-2 sm:h-36 sm:gap-3">
          {MONTHS.map((month, i) => {
            const now = i === MONTHS.length - 1;
            return (
              <div key={month.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                {now && (
                  <motion.span
                    className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary-text"
                    initial={{ opacity: 0, y: 4 }}
                    animate={play ? { opacity: 1, y: 0 } : undefined}
                    transition={{ ...SPRING, delay: 0.75 }}
                  >
                    Now
                  </motion.span>
                )}
                <motion.div
                  className={cn("w-full origin-bottom rounded-md", now ? "bg-primary" : "bg-bar/70")}
                  style={{ height: `${month.height}%` }}
                  initial={{ scaleY: 0 }}
                  animate={play ? { scaleY: 1 } : undefined}
                  transition={{ ...SPRING_SLOW, delay: 0.1 + i * 0.07 }}
                />
                <span className={cn("text-[10px]", now ? "font-semibold" : "text-muted-foreground")}>{month.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {!compact && (
        <div className="hidden flex-col gap-3 rounded-card bg-background/60 p-4 md:flex">
          <span className="label-sm">Goals</span>
          {GOALS.map((goal, i) => (
            <div key={goal.name} className="rounded-xl bg-card p-3">
              <div className="flex justify-between text-xs">
                <span className="font-medium">{goal.name}</span>
                <span className="tabular text-muted-foreground">{goal.progress}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full origin-left rounded-full bg-primary"
                  style={{ width: `${goal.progress}%` }}
                  initial={{ scaleX: 0 }}
                  animate={play ? { scaleX: 1 } : undefined}
                  transition={{ ...SPRING_SLOW, delay: 0.4 + i * 0.1 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
