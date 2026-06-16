"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Lightweight hand-rolled SVG donut (no charting dependency). Animates each arc
 * in on mount via stroke-dashoffset.
 */
export function Donut({
  segments,
  size = 168,
  thickness = 18,
  center,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);

  let offsetAccum = 0;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label="Spending by category"
      >
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          segments.map((seg, i) => {
            const fraction = Math.max(seg.value, 0) / total;
            const dash = fraction * circumference;
            const dashArray = `${dash} ${circumference - dash}`;
            const dashOffset = -offsetAccum * circumference;
            offsetAccum += fraction;
            return (
              <circle
                key={`${seg.label}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeLinecap="butt"
                strokeDasharray={mounted ? dashArray : `0 ${circumference}`}
                strokeDashoffset={dashOffset}
                style={{
                  transition: "stroke-dasharray 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
                  transitionDelay: `${i * 80}ms`,
                }}
              />
            );
          })}
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {center}
        </div>
      )}
    </div>
  );
}

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

export function colorAt(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}

export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; value: string }[];
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2.5 text-sm">
          <span
            className="size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="flex-1 truncate text-muted-foreground">{item.label}</span>
          <span className="tabular font-medium">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
