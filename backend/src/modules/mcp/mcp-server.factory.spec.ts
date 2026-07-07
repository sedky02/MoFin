import { mcpToolSchemas } from './dto/mcp.dto';
import { McpServerFactory } from './mcp-server.factory';
import { MCP_TOOLS } from './mcp-tools';

describe('MCP tool registration', () => {
  it('every advertised tool has a matching Zod schema and vice versa', () => {
    const toolNames = MCP_TOOLS.map((t) => t.name).sort();
    const schemaNames = Object.keys(mcpToolSchemas).sort();
    expect(toolNames).toEqual(schemaNames);
  });

  it('every tool schema exposes a usable raw shape', () => {
    for (const name of Object.keys(mcpToolSchemas) as Array<keyof typeof mcpToolSchemas>) {
      expect(typeof mcpToolSchemas[name].shape).toBe('object');
    }
  });

  it('builds an MCP server for a user and registers all tools without throwing', () => {
    const factory = new McpServerFactory({ dispatch: jest.fn() } as never);
    const server = factory.create('user-1');
    // McpServer keeps registered tools internally; presence of the map confirms wiring.
    const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(Object.keys(registered).sort()).toEqual(MCP_TOOLS.map((t) => t.name).sort());
  });
});
