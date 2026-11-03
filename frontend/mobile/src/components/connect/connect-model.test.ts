import { claudeDeepLink, connectedMessage, geminiCliConfig, mcpUrlFor, unavailableMessage } from './connect-model';

describe('connect model', () => {
  it('derives the connector URL from the API base', () => {
    expect(mcpUrlFor('https://api.test/api/v1/')).toBe('https://api.test/api/v1/mcp');
    expect(mcpUrlFor('')).toBe('');
    expect(mcpUrlFor(undefined)).toBe('');
  });

  it('builds the Claude link with the name and URL encoded', () => {
    const link = claudeDeepLink('https://api.test/api/v1/mcp');
    expect(link).toContain('connectorUrl=https%3A%2F%2Fapi.test%2Fapi%2Fv1%2Fmcp');
    expect(link).toContain('connectorName=MoFin%20%E2%80%94%20Monitor%20your%20Finances');
    expect(claudeDeepLink('')).toBe('');
  });

  it('writes the Gemini CLI config', () => {
    expect(JSON.parse(geminiCliConfig('https://x/mcp'))).toEqual({ mcpServers: { mofin: { url: 'https://x/mcp' } } });
  });

  it('hides the connector for the demo or a server without a URL', () => {
    expect(unavailableMessage('https://x/mcp', true)).toMatch(/isn't available in the demo/);
    expect(unavailableMessage('', false)).toMatch(/isn't available on this server/);
    expect(unavailableMessage('https://x/mcp', false)).toBeNull();
  });

  it('says whether an app is live or needs reconnecting', () => {
    expect(connectedMessage('active', 'Claude')).toBe('Claude is connected to your account.');
    expect(connectedMessage('connected', 'Claude')).toMatch(/isn't signed in right now/);
  });
});
