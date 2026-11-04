import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodTypeAny } from 'zod';
import { listCategoriesQuerySchema } from '../categories/dto/categories.dto';
import { mcpToolSchemas, McpToolName } from '../mcp/dto/mcp.dto';
import { MCP_TOOLS } from '../mcp/mcp-tools';
import { LlmTool } from './llm/llm-provider';

// Loosened signature: the generic return type trips TS2589 on larger schemas
// (same workaround as common/swagger/api-zod.ts).
const toJsonSchema = zodToJsonSchema as unknown as (
  schema: ZodTypeAny,
  options?: unknown,
) => Record<string, unknown>;

/**
 * The chat is read-only by construction: it may use only these tools.
 * `create_draft_transaction` is left out on purpose; drafts come from the
 * composer, and a model that reads user-written text must not be able to
 * write anything.
 */
export const CHAT_MCP_TOOLS: ReadonlyArray<McpToolName> = [
  'search_transactions',
  'get_balance',
  'get_monthly_summary',
  'list_accounts',
  'list_goals',
  'get_goal',
  'get_goal_history',
];

export const LIST_CATEGORIES_TOOL = 'list_categories';

function schemaOf(schema: ZodTypeAny): Record<string, unknown> {
  const json = toJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  });
  delete json.$schema;
  return json;
}

export function buildChatTools(): LlmTool[] {
  const fromMcp = MCP_TOOLS.filter((tool) =>
    CHAT_MCP_TOOLS.includes(tool.name),
  ).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: schemaOf(mcpToolSchemas[tool.name]),
  }));
  return [
    ...fromMcp,
    {
      name: LIST_CATEGORIES_TOOL,
      description:
        "List the user's active categories (id, name, type) so a category name can be turned into the categoryId other tools filter on.",
      parameters: schemaOf(listCategoriesQuerySchema),
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
 * Serialises a tool result for the model within a size budget. A paginated
 * result loses rows from the end until it fits and says so, so the model
 * knows to narrow the search instead of assuming it saw everything.
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
