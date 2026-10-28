import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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
    for (const name of Object.keys(mcpToolSchemas) as Array<
      keyof typeof mcpToolSchemas
    >) {
      expect(typeof mcpToolSchemas[name].shape).toBe('object');
    }
  });

  it('builds an MCP server for a user and registers all tools without throwing', () => {
    const factory = new McpServerFactory({ dispatch: jest.fn() } as never);
    const server = factory.create('user-1');
    // McpServer keeps registered tools internally; presence of the map confirms wiring.
    const registered = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(Object.keys(registered).sort()).toEqual(
      MCP_TOOLS.map((t) => t.name).sort(),
    );
  });

  describe('tool annotations, as a client sees them in tools/list', () => {
    async function listedTools() {
      const server = new McpServerFactory({
        dispatch: jest.fn(),
      } as never).create('user-1');
      const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
      await server.connect(serverSide);
      const client = new Client({ name: 'test', version: '1' });
      await client.connect(clientSide);
      const { tools } = await client.listTools();
      await client.close();
      return tools;
    }

    it('marks every tool except create_draft_transaction as read-only', async () => {
      const tools = await listedTools();
      for (const tool of tools) {
        const expected = tool.name !== 'create_draft_transaction';
        expect({
          name: tool.name,
          readOnly: tool.annotations?.readOnlyHint,
        }).toEqual({ name: tool.name, readOnly: expected });
      }
    });

    it('describes create_draft_transaction as writing a new draft and nothing destructive', async () => {
      const tool = (await listedTools()).find(
        (t) => t.name === 'create_draft_transaction',
      );
      expect(tool?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      });
    });

    it('says no tool reaches outside MoFin, and every tool has annotations', async () => {
      const tools = await listedTools();
      expect(tools).toHaveLength(MCP_TOOLS.length);
      for (const tool of tools) {
        expect(tool.annotations?.openWorldHint).toBe(false);
      }
    });

    it('never exposes an approval tool: approving a draft stays a human step', async () => {
      const names = (await listedTools()).map((t) => t.name);
      expect(names.some((n) => /approve/i.test(n))).toBe(false);
    });
  });
});
