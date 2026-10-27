"use client";

import * as React from "react";
import { useInView } from "motion/react";
import { GoalRing } from "./mock/goal-ring";

const GOALS = [
  { name: "Emergency fund", detail: "$9,454 of $10,000", progress: 0.95, status: "On track" },
  { name: "Groceries budget", detail: "$501 of $600 this month", progress: 0.84, status: "Under budget" },
];

/** Two goal cards whose rings fill when they come into view. */
export function GoalsShowcase() {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  return (
    <div ref={ref} aria-hidden className="grid gap-4 sm:grid-cols-2">
      {GOALS.map((goal) => (
        <div key={goal.name} className="flex items-center gap-4 rounded-card border border-border bg-card p-5 shadow-surface">
          <div className="relative">
            <GoalRing progress={goal.progress} play={inView} />
            <span className="tabular absolute inset-0 flex items-center justify-center text-sm font-semibold">
              {Math.round(goal.progress * 100)}%
            </span>
          </div>
          <div>
            <p className="font-medium">{goal.name}</p>
            <p className="tabular mt-0.5 text-xs text-muted-foreground">{goal.detail}</p>
            <span className="mt-2 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary-text">
              {goal.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
