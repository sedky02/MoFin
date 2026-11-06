import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodTypeAny } from 'zod';
import { monthlySummaryQueryObject } from '../analytics/dto/analytics.dto';
import { listCategoriesQuerySchema } from '../categories/dto/categories.dto';
import { mcpToolSchemas, McpToolName } from '../mcp/dto/mcp.dto';
import { MCP_TOOLS } from '../mcp/mcp-tools';
import {
  CHART_TOOL_NAMES,
  chartToolDescriptions,
  chartToolSchemas,
} from './chat/chart-tools';
import { chatDraftSchema } from './drafts/model-draft-parser';
import { LlmTool } from './llm/llm-provider';

// Loosened signature: the generic return type trips TS2589 on larger schemas
// (same workaround as common/swagger/api-zod.ts).
const toJsonSchema = zodToJsonSchema as unknown as (
  schema: ZodTypeAny,
  options?: unknown,
) => Record<string, unknown>;

/**
 * Read tools from MCP. create_draft_transaction is separate; list_accounts is left out because the
 * prompt already lists accounts and every tool costs tokens.
 */
export const CHAT_MCP_TOOLS: ReadonlyArray<McpToolName> = [
  'search_transactions',
  'get_balance',
  'get_monthly_summary',
  'list_goals',
  'get_goal',
  'get_goal_history',
];
export type ChatMcpToolName = (typeof CHAT_MCP_TOOLS)[number];

export const LIST_CATEGORIES_TOOL = 'list_categories';

/**
 * The one tool that writes: a PENDING draft, never a transaction, shown as a card to approve, edit
 * or reject. Same checks as the Drafts page parser.
 */
export const CREATE_DRAFT_TOOL = 'create_draft_transaction';

/**
 * The MCP schemas, minus `refresh` on the monthly summary: a model has no reason to bypass the
 * cache, and each recompute is a month of queries.
 */
export const chatToolSchemas: Record<ChatMcpToolName, ZodTypeAny> = {
  ...mcpToolSchemas,
  get_monthly_summary: monthlySummaryQueryObject.omit({ refresh: true }),
};

/**
 * Shorter than MCP's: the chat re-sends every tool on every call, and the free tier is about 8k
 * tokens a minute.
 */
const CHAT_DESCRIPTIONS: Partial<Record<ChatMcpToolName, string>> = {
  search_transactions:
    'Find transactions by text, category, account, amount, date range or type. Sorted and paginated.',
  get_balance:
    'Current balance per account and currency. Opening balances included; they are never income.',
  get_monthly_summary:
    "One month's income, expenses, savings rate and category breakdown, in one currency (or one account).",
  list_goals: "The user's savings and spending goals.",
  get_goal: 'One goal with its progress.',
  get_goal_history: "One goal's past periods and how each went.",
};

/** Drops keywords that only add tokens: arguments are validated again on the server. */
function slim(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(slim);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([key]) => key !== 'additionalProperties' && key !== '$schema')
        .map(([key, value]) => [key, slim(value)]),
    );
  }
  return node;
}

function schemaOf(schema: ZodTypeAny): Record<string, unknown> {
  const json = toJsonSchema(schema, {
    // Tool parameters are plain JSON Schema. The openApi3 target writes
    // `exclusiveMinimum: true`, which providers such as Groq reject with a 400.
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  return slim(json) as Record<string, unknown>;
}

export function buildChatTools(): LlmTool[] {
  const fromMcp = MCP_TOOLS.filter((tool) =>
    CHAT_MCP_TOOLS.includes(tool.name),
  ).map((tool) => ({
    name: tool.name,
    description: CHAT_DESCRIPTIONS[tool.name] ?? tool.description,
    parameters: schemaOf(chatToolSchemas[tool.name]),
  }));
  return [
    ...fromMcp,
    {
      name: LIST_CATEGORIES_TOOL,
      description:
        "The user's categories (id, name, type), to turn a category name into the categoryId other tools filter on. Pass accountId for the ones that fit that account: a shared account uses its owner's.",
      parameters: schemaOf(listCategoriesQuerySchema),
    },
    ...CHART_TOOL_NAMES.map((name) => ({
      name,
      description: chartToolDescriptions[name],
      parameters: schemaOf(chartToolSchemas[name]),
    })),
    {
      name: CREATE_DRAFT_TOOL,
      description:
        'Propose one transaction as a pending draft the user approves. One call per transaction. EXPENSE uses fromAccountId, INCOME toAccountId, TRANSFER both. Pass an account id only when the user names the account; otherwise leave it out and the server picks their default. categoryId: an id from the category list for this type, or left out when unsure. occurredAt is YYYY-MM-DD (default today).',
      parameters: schemaOf(chatDraftSchema),
    },
  ];
}

// Fields that tell the model nothing useful and cost tokens (the free tier is
// small: about 8k tokens a minute).
const DROPPED_KEYS = new Set([
  'userId',
  'createdAt',
  'updatedAt',
  'metadata',
  'color',
  'icon',
  'archivedAt',
]);
export const MAX_TOOL_RESULT_CHARS = 6000;

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const toJSON = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof toJSON === 'function') return strip(toJSON.call(value));
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !DROPPED_KEYS.has(key))
        .map(([key, inner]) => [key, strip(inner)]),
    );
  }
  return value;
}

/**
 * A paginated result loses rows from the end until it fits and says so, so the model narrows the
 * search instead of assuming it saw everything.
 */
export function compactToolResult(result: unknown): string {
  const stripped = strip(result);
  let text = JSON.stringify(stripped);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;

  const page = stripped as { data?: unknown[] } | null;
  if (page && Array.isArray(page.data)) {
    let rows = page.data;
    while (rows.length > 1 && text.length > MAX_TOOL_RESULT_CHARS) {
      rows = rows.slice(0, Math.floor(rows.length / 2));
      text = JSON.stringify({
        ...page,
        data: rows,
        truncated: true,
        shown: rows.length,
      });
    }
  }
  return text.length > MAX_TOOL_RESULT_CHARS
    ? JSON.stringify({
        truncated: true,
        note: 'Result too large; narrow the request.',
      })
    : text;
}
