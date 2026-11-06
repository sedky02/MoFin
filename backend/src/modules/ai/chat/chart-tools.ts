import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { currencySchema } from '../../../common/dto/common-fields';

/**
 * Every number comes from the ledger via AnalyticsService, never the model. One shape for donut,
 * bar and line, so clients need one renderer contract.
 */
export interface AiChart {
  kind: 'donut' | 'bar' | 'line';
  title: string;
  currency: string;
  /** How to read `labels`: YYYY-MM months, YYYY-MM-DD days, or plain text. */
  axis: 'month' | 'day' | 'category';
  labels: string[];
  series: Array<{
    name: string;
    /** Which colour family to use: clients map these to their own palette. */
    tone: 'income' | 'expense' | 'balance' | 'neutral';
    values: string[];
  }>;
}

export const MAX_CHARTS_PER_REPLY = 3;
/** A donut stays readable up to this many slices; the rest become "Other". */
export const MAX_DONUT_SLICES = 6;

export const CHART_TOOL_NAMES = [
  'chart_spending_by_category',
  'chart_income_vs_expenses',
  'chart_daily_trend',
] as const;
export type ChartToolName = (typeof CHART_TOOL_NAMES)[number];

const currency = currencySchema.describe('An account currency, e.g. TND');

export const chartToolSchemas = {
  chart_spending_by_category: z
    .object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
      currency,
      accountId: z.string().optional(),
      flow: z.enum(['expense', 'income']).default('expense'),
    })
    .strict(),
  chart_income_vs_expenses: z
    .object({
      months: z.number().int().min(2).max(12).default(6),
      currency,
      accountId: z.string().optional(),
    })
    .strict(),
  chart_daily_trend: z
    .object({
      days: z.number().int().min(7).max(62).default(30),
      currency,
      accountId: z.string().optional(),
      metric: z.enum(['expenses', 'income', 'balance']).default('expenses'),
    })
    .strict(),
} satisfies Record<ChartToolName, z.ZodTypeAny>;

export const chartToolDescriptions: Record<ChartToolName, string> = {
  chart_spending_by_category:
    "Show a donut chart of one month's spending (or income) by category.",
  chart_income_vs_expenses:
    'Show a bar chart of income and expenses per month, for the last N months.',
  chart_daily_trend:
    'Show a chart of daily expenses, income or closing balance, for the last N days.',
};

export function isChartTool(name: string): name is ChartToolName {
  return (CHART_TOOL_NAMES as readonly string[]).includes(name);
}

const decimal = (value: string | number | Prisma.Decimal) =>
  new Prisma.Decimal(String(value));

export function categoryDonut(
  breakdown: Array<{ category: string; amount: string }>,
  title: string,
  chartCurrency: string,
  tone: 'income' | 'expense',
): AiChart {
  const rows = breakdown
    .filter((row) => decimal(row.amount).greaterThan(0))
    .sort((a, b) => decimal(b.amount).comparedTo(decimal(a.amount)));
  const shown = rows.slice(0, MAX_DONUT_SLICES - 1);
  const rest = rows.slice(MAX_DONUT_SLICES - 1);
  if (rest.length === 1) shown.push(rest[0]);
  else if (rest.length > 1) {
    shown.push({
      category: 'Other',
      amount: rest
        .reduce((sum, row) => sum.plus(decimal(row.amount)), decimal(0))
        .toString(),
    });
  }
  return {
    kind: 'donut',
    title,
    currency: chartCurrency,
    axis: 'category',
    labels: shown.map((row) => row.category),
    series: [
      {
        name: tone === 'income' ? 'Income' : 'Expenses',
        tone,
        values: shown.map((row) => row.amount),
      },
    ],
  };
}

export function incomeVsExpensesBars(
  points: Array<{ month: string; income: string; expenses: string }>,
  chartCurrency: string,
): AiChart {
  return {
    kind: 'bar',
    title: `Income vs expenses, last ${points.length} months`,
    currency: chartCurrency,
    axis: 'month',
    labels: points.map((point) => point.month),
    series: [
      {
        name: 'Income',
        tone: 'income',
        values: points.map((point) => point.income),
      },
      {
        name: 'Expenses',
        tone: 'expense',
        values: points.map((point) => point.expenses),
      },
    ],
  };
}

export function dailyTrend(
  points: Array<{
    date: string;
    income: string;
    expenses: string;
    balance: string;
  }>,
  metric: 'expenses' | 'income' | 'balance',
  chartCurrency: string,
): AiChart {
  const names = {
    expenses: 'Daily expenses',
    income: 'Daily income',
    balance: 'Closing balance',
  };
  const tones = {
    expenses: 'expense',
    income: 'income',
    balance: 'balance',
  } as const;
  return {
    // Flows are discrete per day; a balance is continuous.
    kind: metric === 'balance' ? 'line' : 'bar',
    title: `${names[metric]}, last ${points.length} days`,
    currency: chartCurrency,
    axis: 'day',
    labels: points.map((point) => point.date),
    series: [
      {
        name: names[metric],
        tone: tones[metric],
        values: points.map((point) => point[metric]),
      },
    ],
  };
}

/** The model sees the same numbers, small, so it can discuss them without repeating every value. */
export function chartForModel(chart: AiChart, index: number) {
  return {
    shownToUser: true,
    chart: index,
    note: 'The user sees this chart under your reply. Mention what stands out; do not list every value.',
    kind: chart.kind,
    title: chart.title,
    currency: chart.currency,
    labels: chart.labels,
    series: chart.series.map(({ name, values }) => ({ name, values })),
  };
}
