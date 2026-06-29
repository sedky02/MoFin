import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { AuthService } from '../../modules/auth/auth.service';

/**
 * Authenticates MCP requests via either:
 *  - `x-api-key` (or a legacy `mcp_…` Bearer): the existing API-key path, kept
 *    for MCP Inspector / programmatic use; or
 *  - an OAuth 2.1 Bearer access token (what claude.ai sends): a JWT signed with
 *    JWT_ACCESS_SECRET that MUST carry our issuer, the MCP resource audience and
 *    the `mcp` scope. Requiring aud+scope stops a plain web-session token from
 *    being replayed against the MCP endpoint.
 *
 * When no valid credential is present we return 401 with a `WWW-Authenticate`
 * header pointing at the protected-resource metadata — this is what makes
 * claude.ai start the OAuth flow.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const apiKeyHeader = request.header('x-api-key');
    const bearer = request.header('authorization')?.replace(/^Bearer\s+/i, '');

    try {
      if (apiKeyHeader) {
        request.user = await this.authService.validateApiKey(apiKeyHeader);
        return true;
      }
      if (bearer) {
        // Legacy API keys may arrive as a Bearer; everything else is an OAuth JWT.
        request.user = bearer.startsWith('mcp_')
          ? await this.authService.validateApiKey(bearer)
          : await this.validateOAuthToken(bearer);
        return true;
      }
    } catch {
      // fall through to the 401 + WWW-Authenticate challenge below
    }

    this.challenge(context);
    throw new UnauthorizedException('Missing or invalid MCP credentials');
  }

  private async validateOAuthToken(token: string) {
    const issuer = this.config.getOrThrow<string>('OAUTH_ISSUER').replace(/\/$/, '');
    const audience =
      this.config.get<string>('OAUTH_RESOURCE_URI') ?? `${issuer}/api/v1/mcp`;

    const payload = await this.jwt.verifyAsync<{
      sub: string;
      email: string;
      scope?: string;
    }>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      issuer,
      audience,
    });

    const scopes = (payload.scope ?? '').split(' ');
    if (!scopes.includes('mcp')) {
      throw new UnauthorizedException('token missing mcp scope');
    }
    return { id: payload.sub, email: payload.email };
  }

  private challenge(context: ExecutionContext) {
    const issuer = this.config.getOrThrow<string>('OAUTH_ISSUER').replace(/\/$/, '');
    const metadataUrl = `${issuer}/.well-known/oauth-protected-resource`;
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${metadataUrl}", error="invalid_token"`,
    );
  }
}
