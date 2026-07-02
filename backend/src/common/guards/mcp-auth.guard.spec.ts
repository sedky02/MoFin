import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { McpAuthGuard } from './mcp-auth.guard';
import { OAuthMcpAuthGuard } from './oauth-mcp-auth.guard';

function contextWithHeaders(headers: Record<string, string>): {
  ctx: ExecutionContext;
  setHeader: jest.Mock;
} {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const request = { header: (name: string) => lower[name.toLowerCase()], user: undefined };
  const setHeader = jest.fn();
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, setHeader };
}

describe('MCP auth guards', () => {
  describe('ApiKeyAuthGuard.extractKey', () => {
    const extract = (headers: Record<string, string>) =>
      ApiKeyAuthGuard.extractKey(contextWithHeaders(headers).ctx.switchToHttp().getRequest());

    it('reads the x-api-key header', () => {
      expect(extract({ 'x-api-key': 'mcp_a.b' })).toBe('mcp_a.b');
    });
    it('reads a legacy mcp_ Bearer token', () => {
      expect(extract({ authorization: 'Bearer mcp_a.b' })).toBe('mcp_a.b');
    });
    it('ignores a non-mcp_ Bearer (OAuth JWT)', () => {
      expect(extract({ authorization: 'Bearer eyJhb.jwt.sig' })).toBeUndefined();
    });
    it('returns undefined with no credentials', () => {
      expect(extract({})).toBeUndefined();
    });
  });

  describe('McpAuthGuard routing', () => {
    const apiKeyGuard = { canActivate: jest.fn() } as unknown as ApiKeyAuthGuard;
    const oauthGuard = {
      canActivate: jest.fn(),
      writeChallenge: jest.fn(),
    } as unknown as OAuthMcpAuthGuard;
    const guard = new McpAuthGuard(apiKeyGuard, oauthGuard);

    afterEach(() => jest.clearAllMocks());

    it('routes an API-key request to ApiKeyAuthGuard only', async () => {
      (apiKeyGuard.canActivate as jest.Mock).mockResolvedValue(true);
      const { ctx } = contextWithHeaders({ 'x-api-key': 'mcp_a.b' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(apiKeyGuard.canActivate).toHaveBeenCalledTimes(1);
      expect(oauthGuard.canActivate).not.toHaveBeenCalled();
    });

    it('routes a JWT Bearer request to OAuthMcpAuthGuard only', async () => {
      (oauthGuard.canActivate as jest.Mock).mockResolvedValue(true);
      const { ctx } = contextWithHeaders({ authorization: 'Bearer eyJhb.jwt.sig' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(oauthGuard.canActivate).toHaveBeenCalledTimes(1);
      expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
    });

    it('routes no-credential requests to OAuthMcpAuthGuard (which challenges)', async () => {
      (oauthGuard.canActivate as jest.Mock).mockRejectedValue(new UnauthorizedException());
      const { ctx } = contextWithHeaders({});
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(oauthGuard.canActivate).toHaveBeenCalledTimes(1);
    });

    it('guarantees the WWW-Authenticate challenge when the API-key path fails', async () => {
      (apiKeyGuard.canActivate as jest.Mock).mockRejectedValue(new UnauthorizedException());
      const { ctx } = contextWithHeaders({ 'x-api-key': 'mcp_bad' });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(oauthGuard.writeChallenge).toHaveBeenCalledWith(ctx);
    });
  });
});
