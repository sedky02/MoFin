import { buildChatTools } from './ai-chat-tools';

/** Collects every value stored under `key` anywhere in a nested schema. */
function valuesOf(node: unknown, key: string): unknown[] {
  if (Array.isArray(node)) return node.flatMap((n) => valuesOf(n, key));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => [
      ...(k === key ? [v] : []),
      ...valuesOf(v, key),
    ]);
  }
  return [];
}

describe('buildChatTools', () => {
  const tools = buildChatTools();

  it('emits plain JSON Schema that model providers accept', () => {
    for (const tool of tools) {
      expect(tool.parameters.type).toBe('object');
      // OpenAPI 3.0 writes these as booleans; JSON Schema needs numbers, and
      // providers answer a boolean with a 400.
      for (const key of ['exclusiveMinimum', 'exclusiveMaximum']) {
        for (const value of valuesOf(tool.parameters, key)) {
          expect(typeof value).toBe('number');
        }
      }
      // OpenAPI-only keyword.
      expect(valuesOf(tool.parameters, 'nullable')).toEqual([]);
    }
  });

  it('exposes only the read-only chat tools', () => {
    expect(tools.map((t) => t.name)).not.toContain('create_draft_transaction');
  });
});
