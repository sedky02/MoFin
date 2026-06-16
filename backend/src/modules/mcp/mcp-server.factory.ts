import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';
import { ZodRawShape } from 'zod';
import { mcpToolSchemas } from './dto/mcp.dto';
import { MCP_TOOLS } from './mcp-tools';
import { McpService } from './mcp.service';

type ToolResult = { content: Array<{ type: 'text'; text: string }> };
type RegisterTool = (
  name: string,
  config: { title: string; description: string; inputSchema: ZodRawShape },
  cb: (args: Record<string, unknown>) => Promise<ToolResult>,
) => unknown;

/**
 * Builds a per-request MCP server scoped to a single authenticated user.
 *
 * Each tool's inputSchema is the Zod raw shape from `mcpToolSchemas`, so the MCP
 * server validates arguments before invoking the handler; the handler then
 * delegates to `McpService.dispatch`, which only calls application services.
 */
@Injectable()
export class McpServerFactory {
  constructor(private readonly mcp: McpService) {}

  create(userId: string): McpServer {
    const server = new McpServer({ name: 'mofin', version: '0.1.0' });

    // Bind to a loose signature: registering a union of differently-typed
    // schemas in a loop otherwise trips registerTool's deep generic inference.
    const register = server.registerTool.bind(server) as unknown as RegisterTool;

    for (const tool of MCP_TOOLS) {
      register(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: mcpToolSchemas[tool.name].shape as ZodRawShape,
        },
        async (args) => {
          const result = await this.mcp.dispatch(userId, tool.name, args);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        },
      );
    }

    return server;
  }
}
