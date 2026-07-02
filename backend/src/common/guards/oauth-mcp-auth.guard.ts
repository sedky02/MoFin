import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';

/**
 * OAuth 2.1 authentication for production MCP clients (what claude.ai sends).
 *
 * Validates a `Bearer <jwt>` access token signed with JWT_ACCESS_SECRET that
 * MUST carry our issuer, the MCP resource audience and the `mcp` scope —
 * requiring aud+scope stops a plain web-session token from being replayed
 * against the MCP endpoint. On any failure it emits an RFC 9728 compliant
 * `WWW-Authenticate` header, which is what makes claude.ai start the OAuth flow.
 */
@Injectable()
export class OAuthMcpAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const bearer = request.header('authorization')?.replace(/^Bearer\s+/i, '');

    try {
      if (!bearer) throw new UnauthorizedException('Missing OAuth access token');
      request.user = await this.validateOAuthToken(bearer);
      return true;
    } catch {
      this.writeChallenge(context);
      throw new UnauthorizedException('Missing or invalid MCP credentials');
    }
  }

  private async validateOAuthToken(token: string) {
    const issuer = this.config.getOrThrow<string>('OAUTH_ISSUER').replace(/\/$/, '');
    const audience = this.config.get<string>('OAUTH_RESOURCE_URI') ?? `${issuer}/api/v1/mcp`;

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

  /**
   * Sets the RFC 9728 `WWW-Authenticate` challenge pointing at the
   * protected-resource metadata. Exposed so the composite guard can guarantee
   * the header on any MCP auth failure, including the API-key path.
   */
  writeChallenge(context: ExecutionContext): void {
    const issuer = this.config.getOrThrow<string>('OAUTH_ISSUER').replace(/\/$/, '');
    const metadataUrl = `${issuer}/.well-known/oauth-protected-resource`;
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${metadataUrl}", error="invalid_token"`,
    );
  }
}
