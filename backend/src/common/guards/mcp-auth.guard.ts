import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { OAuthMcpAuthGuard } from './oauth-mcp-auth.guard';

/**
 * Thin composite that selects the MCP authentication strategy by credential
 * presence, keeping API-key and OAuth logic fully separated:
 *
 *  - `x-api-key` header or a `mcp_…` Bearer  → {@link ApiKeyAuthGuard}
 *    (MCP Inspector / dev / programmatic clients)
 *  - anything else, including no credential  → {@link OAuthMcpAuthGuard}
 *    (production MCP clients such as claude.ai)
 *
 * Routing on the credential — rather than the environment — means Inspector
 * keeps working with an API key in production and claude.ai keeps working with
 * OAuth in development. On any failure the OAuth `WWW-Authenticate` challenge is
 * guaranteed, preserving the original single-guard behaviour.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeyGuard: ApiKeyAuthGuard,
    private readonly oauthGuard: OAuthMcpAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const usesApiKey = ApiKeyAuthGuard.extractKey(request) !== undefined;

    try {
      return usesApiKey
        ? await this.apiKeyGuard.canActivate(context)
        : await this.oauthGuard.canActivate(context);
    } catch (err) {
      // Guarantee the RFC 9728 challenge on every failure (the API-key path does
      // not emit it), so an unauthenticated client is always told how to start
      // the OAuth flow — matching the original guard's behaviour.
      this.oauthGuard.writeChallenge(context);
      throw err;
    }
  }
}
