import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';

/**
 * API-key authentication for MCP requests — the path used by MCP Inspector and
 * programmatic/dev clients. Accepts the key via the `x-api-key` header or a
 * legacy `mcp_…` Bearer token, validates it against the stored key hash, and
 * populates `request.user`.
 *
 * This guard intentionally knows nothing about OAuth or the RFC 9728 challenge:
 * OAuth-specific concerns live in {@link OAuthMcpAuthGuard}.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = ApiKeyAuthGuard.extractKey(request);
    if (!key) {
      throw new UnauthorizedException('Missing MCP API key');
    }

    request.user = await this.authService.validateApiKey(key);
    return true;
  }

  /** The API-key credential, from `x-api-key` or a `mcp_…` Bearer, or undefined. */
  static extractKey(request: Request): string | undefined {
    const apiKeyHeader = request.header('x-api-key');
    if (apiKeyHeader) return apiKeyHeader;

    const bearer = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    return bearer?.startsWith('mcp_') ? bearer : undefined;
  }
}
