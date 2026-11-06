import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DraftSource, DraftTransaction } from '@prisma/client';
import { ZodError } from 'zod';
import { localDate } from '../../../common/utils/time-zone';
import { AnalyticsService } from '../../analytics/analytics.service';
import { CategoriesService } from '../../categories/categories.service';
import { listCategoriesQuerySchema } from '../../categories/dto/categories.dto';
import { DraftTransactionsService } from '../../draft-transactions/draft-transactions.service';
import { McpService } from '../../mcp/mcp.service';
import { AiService } from '../ai.service';
import { repairDraft } from '../drafts/draft-repairer';
import { chatDraftSchema } from '../drafts/model-draft-parser';
import {
  CHAT_MCP_TOOLS,
  ChatMcpToolName,
  chatToolSchemas,
  compactToolResult,
  CREATE_DRAFT_TOOL,
  LIST_CATEGORIES_TOOL,
} from '../ai-chat-tools';
import {
  AiChart,
  ChartToolName,
  categoryDonut,
  chartToolSchemas,
  dailyTrend,
  incomeVsExpensesBars,
  isChartTool,
} from './chart-tools';

export interface ToolRunContext {
  userId: string;
  timeZone: string;
  now: Date;
  /** The question being answered: kept on the drafts it leads to, as their raw input. */
  question: string;
  /** Spoken questions label their drafts as voice. */
  source: typeof DraftSource.CHAT | typeof DraftSource.VOICE;
  /** Demo visitors are capped on AI drafts, as on the Drafts page. */
  isDemo: boolean;
}

export interface ToolRunResult {
  /** What goes back to the model, already size-capped. */
  content: string;
  /** Set when the tool drew a chart for the user. */
  chart?: AiChart;
  /** Set when the tool created a draft for the user to approve. */
  draft?: DraftTransaction;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const error = (message: string, extra: object = {}): ToolRunResult => ({
  content: JSON.stringify({ error: message, ...extra }),
});
const invalid = (zodError: ZodError): ToolRunResult =>
  error('Invalid arguments', {
    issues: zodError.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  });

/** `YYYY-MM-DD` minus `n` calendar days. */
function daysBefore(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Runs one tool call from the chat model, always as `userId` (from the JWT,
 * never from the model). Anything off the allowlist is refused. The only tool
 * that writes makes a pending draft, never a transaction. Arguments are
 * validated before anything runs; errors go back to the model as text so it
 * can retry or explain.
 */
@Injectable()
export class ChatToolRunner {
  private readonly logger = new Logger(ChatToolRunner.name);

  constructor(
    private readonly mcp: McpService,
    private readonly categories: CategoriesService,
    private readonly analytics: AnalyticsService,
    private readonly drafts: DraftTransactionsService,
    private readonly draftParser: AiService,
    private readonly config: ConfigService,
  ) {}

  async run(
    ctx: ToolRunContext,
    name: string,
    rawArguments: string,
  ): Promise<ToolRunResult> {
    let args: unknown;
    try {
      args = rawArguments ? JSON.parse(rawArguments) : {};
    } catch {
      return error('Arguments were not valid JSON.');
    }

    try {
      if (name === LIST_CATEGORIES_TOOL) {
        const query = listCategoriesQuerySchema.parse(args);
        const page = await this.categories.list(ctx.userId, query);
        return {
          content: compactToolResult({
            ...page,
            data: page.data.map(({ id, name: label, type }) => ({
              id,
              name: label,
              type,
            })),
          }),
        };
      }
      if (isChartTool(name)) return await this.chart(ctx, name, args);
      if (name === CREATE_DRAFT_TOOL) return await this.createDraft(ctx, args);
      if (!(CHAT_MCP_TOOLS as readonly string[]).includes(name)) {
        return error(`Unknown tool: ${name}`);
      }
      const toolName = name as ChatMcpToolName;
      const parsed = chatToolSchemas[toolName].safeParse(args);
      if (!parsed.success) return invalid(parsed.error);
      const result = await this.mcp.dispatch(
        ctx.userId,
        toolName,
        toolName === 'get_monthly_summary'
          ? { ...(parsed.data as object), refresh: false }
          : parsed.data,
      );
      return { content: compactToolResult(result) };
    } catch (caught) {
      // Business-rule errors (400/404) are useful to the model; anything else is not.
      const message =
        caught instanceof HttpException && caught.getStatus() < 500
          ? caught.message
          : 'The tool failed.';
      this.logger.warn(`Chat tool ${name} failed: ${message}`);
      return error(message);
    }
  }

  /**
   * A pending draft from the model's arguments, checked like the Drafts page's
   * parser output: ids must be the user's (others are dropped and the
   * confidence lowered), the date is read in the user's zone. Never a
   * transaction: the user approves it.
   */
  private async createDraft(
    ctx: ToolRunContext,
    args: unknown,
  ): Promise<ToolRunResult> {
    if (ctx.isDemo) {
      const cap = this.config.getOrThrow<number>('DEMO_AI_CAP');
      if ((await this.drafts.countForUser(ctx.userId)) >= cap) {
        return error(
          `The demo allows ${cap} drafts and they are used up. Tell the user to create an account to keep going.`,
        );
      }
    }
    const parsed = chatDraftSchema.safeParse(args);
    if (!parsed.success) return invalid(parsed.error);

    const draftCtx = await this.draftParser.draftContext(ctx.userId, {
      input: ctx.question,
      timeZone: ctx.timeZone,
    });
    const { data, confidence } = repairDraft(
      { ...parsed.data, occurredAt: parsed.data.occurredAt ?? draftCtx.today },
      draftCtx,
    );
    const [draft] = await this.drafts.createMany(
      ctx.userId,
      [
        {
          rawInput: ctx.question,
          parsedData: data,
          confidenceScore: confidence,
        },
      ],
      { source: ctx.source },
    );
    return {
      content: JSON.stringify({
        created: true,
        draftId: draft.id,
        status: 'PENDING',
        draft: data,
        note: 'Shown to the user as a card under your reply with Approve, Edit and Reject. It is only a draft until they approve it; do not ask them to confirm in text.',
      }),
      draft,
    };
  }

  private async chart(
    ctx: ToolRunContext,
    name: ChartToolName,
    args: unknown,
  ): Promise<ToolRunResult> {
    let chart: AiChart;
    if (name === 'chart_spending_by_category') {
      const a = chartToolSchemas.chart_spending_by_category.safeParse(args);
      if (!a.success) return invalid(a.error);
      const { year, month, accountId, currency, flow } = a.data;
      const summary = (await this.analytics.getMonthlySummary(
        ctx.userId,
        year,
        month,
        false,
        accountId,
        currency,
      )) as {
        categoryBreakdown: Array<{ category: string; amount: string }>;
        incomeBreakdown: Array<{ category: string; amount: string }>;
      };
      const income = flow === 'income';
      chart = categoryDonut(
        income ? summary.incomeBreakdown : summary.categoryBreakdown,
        `${income ? 'Income' : 'Spending'} by category, ${MONTHS[month - 1]} ${year}`,
        currency,
        income ? 'income' : 'expense',
      );
    } else if (name === 'chart_income_vs_expenses') {
      const a = chartToolSchemas.chart_income_vs_expenses.safeParse(args);
      if (!a.success) return invalid(a.error);
      const series = await this.analytics.getMonthlySeries(
        ctx.userId,
        a.data.months,
        a.data.currency,
        a.data.accountId,
      );
      chart = incomeVsExpensesBars(series.points, a.data.currency);
    } else {
      const a = chartToolSchemas.chart_daily_trend.safeParse(args);
      if (!a.success) return invalid(a.error);
      const today = localDate(ctx.now, ctx.timeZone);
      const series = await this.analytics.getDailySeries(
        ctx.userId,
        daysBefore(today, a.data.days - 1),
        a.data.days,
        a.data.currency,
        a.data.accountId,
        ctx.timeZone,
      );
      chart = dailyTrend(series.points, a.data.metric, a.data.currency);
    }

    // A chart of nothing but zeros says less than a sentence does.
    const empty = chart.series.every((series) =>
      series.values.every((value) => Number(value) === 0),
    );
    if (
      chart.labels.length === 0 ||
      (empty && chart.series[0]?.tone !== 'balance')
    ) {
      return error(
        'No activity to chart for that period and currency. Say so instead of showing a chart.',
      );
    }
    return { content: '', chart };
  }
}
