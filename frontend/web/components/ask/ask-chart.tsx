"use client";

import * as React from "react";
import { Donut, Legend } from "@/components/dashboard/donut";
import { MoneyAmount } from "@/components/common/money-amount";
import { tryParse } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import { scaleY, weekScale } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { AiChart } from "@/lib/types";

type Tone = AiChart["series"][number]["tone"];

// Lime for money in, blue for money out: they differ in lightness as well as hue,
// so the pair still reads with red-green colour blindness. The legend names them too.
const TONE_COLOR: Record<Tone, string> = {
  income: "var(--chart-1)",
  expense: "var(--chart-2)",
  balance: "var(--chart-2)",
  neutral: "var(--bar)",
};

const DONUT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const num = (value: string) => tryParse(value)?.toNumber() ?? 0;

/** "2026-10" -> "Oct" (with the year when the range crosses one), "2026-11-03" -> "Nov 3", text as is. */
export function axisLabel(label: string, axis: AiChart["axis"], withYear = false, locale?: string): string {
  if (axis === "month" && /^\d{4}-\d{2}$/.test(label)) {
    return new Date(`${label}-01T00:00:00Z`).toLocaleDateString(locale, {
      month: "short",
      ...(withYear ? { year: "2-digit" } : {}),
      timeZone: "UTC",
    });
  }
  if (axis === "day" && /^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return new Date(`${label}T00:00:00Z`).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return label;
}

/** Long form for screen readers and tooltips: "October 2026", "Tuesday, November 3". */
function longLabel(label: string, axis: AiChart["axis"]): string {
  if (axis === "month" && /^\d{4}-\d{2}$/.test(label)) {
    return new Date(`${label}-01T00:00:00Z`).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (axis === "day" && /^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return new Date(`${label}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return label;
}

/** Every label for a few bars; with many (a month of days), about seven, evenly spread. */
function showLabelAt(i: number, count: number): boolean {
  const every = Math.ceil(count / 7);
  return every <= 1 || i % every === 0 || i === count - 1;
}

/**
 * A chart the assistant attached to an answer. Every number came from the
 * ledger on the server. Hand-rolled like the dashboard's charts (no charting
 * dependency), with a hidden table carrying the same data for screen readers.
 */
export function AskChart({ chart }: { chart: AiChart }) {
  return (
    <figure className="relative rounded-[0.875rem] bg-secondary/55 p-4 sm:p-5">
      <figcaption className="mb-4 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold tracking-[-0.01em]">{chart.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{chart.currency}</span>
      </figcaption>
      {chart.kind === "donut" ? (
        <DonutChart chart={chart} />
      ) : chart.kind === "line" ? (
        <LineChart chart={chart} />
      ) : (
        <BarChart chart={chart} />
      )}
      <DataTable chart={chart} />
    </figure>
  );
}

function DonutChart({ chart }: { chart: AiChart }) {
  const series = chart.series[0];
  const values = series?.values ?? [];
  const total = values.reduce((sum, v) => sum + num(v), 0);
  const segments = chart.labels.map((label, i) => ({
    label,
    value: num(values[i] ?? "0"),
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
      <Donut
        segments={segments}
        size={150}
        thickness={16}
        ariaLabel={`${chart.title}, as a donut chart`}
        center={
          <>
            <span className="text-[11px] text-muted-foreground">Total</span>
            <MoneyAmount amount={String(total)} currency={chart.currency} compact className="text-base font-semibold" />
          </>
        }
      />
      <Legend
        className="w-full min-w-0 flex-1"
        items={segments.map((s, i) => ({
          label: `${s.label} · ${total > 0 ? Math.round((s.value / total) * 100) : 0}%`,
          color: s.color,
          value: formatMoney(values[i] ?? "0", chart.currency),
        }))}
      />
    </div>
  );
}

function SeriesLegend({ chart }: { chart: AiChart }) {
  if (chart.series.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
      {chart.series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: TONE_COLOR[s.tone] }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/** Y axis gridlines plus the plot area; children draw inside the plot. */
function Plot({
  chart,
  scale,
  children,
}: {
  chart: AiChart;
  scale: ReturnType<typeof weekScale>;
  children: React.ReactNode;
}) {
  const crossesYear = chart.axis === "month" && new Set(chart.labels.map((l) => l.slice(0, 4))).size > 1;
  return (
    <div aria-hidden>
      <div className="flex gap-3" style={{ height: 170 }}>
        <div className="relative flex-1">
          {scale.ticks.map((t) => (
            <div
              key={t}
              className={cn(
                "absolute inset-x-0 border-t",
                t === 0 ? "border-border" : "border-dashed border-border/60",
              )}
              style={{ top: `${scaleY(t, scale) * 100}%` }}
            />
          ))}
          {children}
        </div>
        <div className="relative w-14 shrink-0 whitespace-nowrap text-[11px] text-muted-foreground tabular">
          {scale.ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${scaleY(t, scale) * 100}%` }}>
              <MoneyAmount amount={String(t)} currency={chart.currency} compact />
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 flex pr-[68px]">
        {chart.labels.map((label, i) => (
          <span key={label} className="flex-1 truncate text-center text-[11px] text-muted-foreground">
            {showLabelAt(i, chart.labels.length) ? axisLabel(label, chart.axis, crossesYear) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The value bubble shown over a hovered or tapped point. */
function Bubble({
  chart,
  index,
  open,
  style,
}: {
  chart: AiChart;
  index: number;
  /** Pinned by a tap; otherwise it shows while its column is hovered. */
  open: boolean;
  style: React.CSSProperties;
}) {
  // Near either edge the bubble hangs inward, so it never spills past the card
  // (which would scroll the page sideways on a phone).
  const n = chart.labels.length;
  const align = index < n * 0.25 ? "start" : index >= n * 0.75 ? "end" : "center";
  return (
    <span
      className={cn(
        align === "center" && "-translate-x-1/2",
        align === "end" && "-translate-x-full",
        "pointer-events-none absolute z-10 whitespace-nowrap rounded-xl bg-popover px-2.5 py-1.5 text-[11px] shadow-surface transition-opacity",
        open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
      style={{
        ...style,
        left: align === "start" ? 0 : align === "end" ? "100%" : "50%",
      }}
    >
      <span className="block font-medium text-muted-foreground">{longLabel(chart.labels[index], chart.axis)}</span>
      {chart.series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5 font-semibold text-foreground">
          {chart.series.length > 1 && (
            <span className="size-2 rounded-sm" style={{ backgroundColor: TONE_COLOR[s.tone] }} />
          )}
          <MoneyAmount amount={s.values[index] ?? "0"} currency={chart.currency} />
        </span>
      ))}
    </span>
  );
}

function BarChart({ chart }: { chart: AiChart }) {
  const [picked, setPicked] = React.useState<number | null>(null);
  const all = chart.series.flatMap((s) => s.values.map(num));
  const scale = weekScale(all);
  const zero = scaleY(0, scale) * 100;
  const many = chart.labels.length > 14;

  return (
    <>
      <SeriesLegend chart={chart} />
      <Plot chart={chart} scale={scale}>
        <div className={cn("absolute inset-0 flex", many ? "gap-px" : "gap-1.5 sm:gap-2")}>
          {chart.labels.map((label, i) => {
            const open = picked === i;
            const peak = Math.max(0, ...chart.series.map((s) => num(s.values[i] ?? "0")));
            return (
              // Pointer users hover or tap a column for its amounts; keyboard and
              // screen-reader users get the same numbers from the table below.
              <div
                key={label}
                className="group relative flex flex-1 cursor-default gap-px"
                onClick={() => setPicked(open ? null : i)}
              >
                {chart.series.map((s) => {
                  const v = num(s.values[i] ?? "0");
                  const top = scaleY(Math.max(v, 0), scale) * 100;
                  const bottom = 100 - scaleY(Math.min(v, 0), scale) * 100;
                  return (
                    <span key={s.name} className="relative flex-1">
                      <span
                        className={cn(
                          "absolute inset-x-0 transition-[filter,opacity] group-hover:brightness-110",
                          v < 0 ? "rounded-b-[3px]" : "rounded-t-[3px]",
                          v === 0 && "opacity-30",
                          picked !== null && !open && "opacity-50",
                        )}
                        style={{
                          backgroundColor: TONE_COLOR[s.tone],
                          top: `${top}%`,
                          bottom: `${v === 0 ? 100 - zero - 1 : bottom}%`,
                        }}
                      />
                    </span>
                  );
                })}
                <Bubble
                  chart={chart}
                  index={i}
                  open={open}
                  style={{
                    bottom: `calc(${100 - scaleY(peak, scale) * 100}% + 6px)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </Plot>
    </>
  );
}

function LineChart({ chart }: { chart: AiChart }) {
  const [picked, setPicked] = React.useState<number | null>(null);
  const series = chart.series[0];
  const values = (series?.values ?? []).map(num);
  const scale = weekScale(values);
  const n = values.length;
  // x at the centre of each label's column, so points line up with the axis labels.
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => scaleY(v, scale) * 100;
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${x(0)},${y(Math.max(scale.min, 0))} ${line} ${x(n - 1)},${y(Math.max(scale.min, 0))}`;
  const color = TONE_COLOR[series?.tone ?? "balance"];
  const gradientId = React.useId();

  return (
    <Plot chart={chart} scale={scale}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute inset-0 flex">
        {values.map((v, i) => {
          const open = picked === i;
          return (
            <div key={chart.labels[i]} className="group relative flex-1" onClick={() => setPicked(open ? null : i)}>
              <span
                className={cn(
                  "absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card transition-opacity",
                  open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
                style={{ top: `${y(v)}%`, backgroundColor: color }}
              />
              <Bubble chart={chart} index={i} open={open} style={{ bottom: `calc(${100 - y(v)}% + 10px)` }} />
            </div>
          );
        })}
      </div>
    </Plot>
  );
}

function DataTable({ chart }: { chart: AiChart }) {
  return (
    // sr-only can't shrink a <table> (tables grow to their content), so a wrapper does:
    // otherwise the hidden table stretches the page and adds a scrollbar.
    <div className="sr-only">
      <table>
        <caption>
          {chart.title}, in {chart.currency}
        </caption>
        <thead>
          <tr>
            <th scope="col">{chart.axis === "category" ? "Category" : chart.axis === "month" ? "Month" : "Day"}</th>
            {chart.series.map((s) => (
              <th key={s.name} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.labels.map((label, i) => (
            <tr key={label}>
              <th scope="row">{longLabel(label, chart.axis)}</th>
              {chart.series.map((s) => (
                <td key={s.name}>{formatMoney(s.values[i] ?? "0", chart.currency)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
