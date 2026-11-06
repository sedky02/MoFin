import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';
import { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { ZodRawShape } from 'zod';
import { mcpToolSchemas } from './dto/mcp.dto';
import { MCP_TOOLS } from './mcp-tools';
import { DraftOrigin } from '../draft-transactions/draft-transactions.service';
import { McpService } from './mcp.service';

type ToolResult = { content: Array<{ type: 'text'; text: string }> };
type RegisterTool = (
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: ZodRawShape;
    annotations: ToolAnnotations;
  },
  cb: (args: Record<string, unknown>) => Promise<ToolResult>,
) => unknown;

/**
 * Per-request MCP server scoped to one user: Zod raw shapes validate arguments before the handler,
 * which only calls McpService.dispatch.
 */
@Injectable()
export class McpServerFactory {
  constructor(private readonly mcp: McpService) {}

  /** `origin` labels the drafts this session creates with the connected app's name. */
  create(userId: string, origin?: DraftOrigin): McpServer {
    const server = new McpServer({ name: 'mofin', version: '0.1.0' });

    // Bind to a loose signature: registering a union of differently-typed
    // schemas in a loop otherwise trips registerTool's deep generic inference.
    const register = server.registerTool.bind(
      server,
    ) as unknown as RegisterTool;

    for (const tool of MCP_TOOLS) {
      register(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          annotations: tool.annotations,
          inputSchema: mcpToolSchemas[tool.name].shape,
        },
        async (args) => {
          const result = await this.mcp.dispatch(
            userId,
            tool.name,
            args,
            origin,
          );
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        },
      );
    }

    return server;
  }
}
