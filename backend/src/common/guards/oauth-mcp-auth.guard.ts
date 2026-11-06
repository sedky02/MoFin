import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';

/**
 * Bearer JWT signed with JWT_MCP_SECRET (not the web key) with our issuer, MCP audience and scope.
 * Failures send an RFC 9728 challenge, which starts claude.ai's OAuth flow.
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
      if (!bearer)
        throw new UnauthorizedException('Missing OAuth access token');
      request.user = await this.validateOAuthToken(bearer);
      return true;
    } catch {
      this.writeChallenge(context);
      throw new UnauthorizedException('Missing or invalid MCP credentials');
    }
  }

  private async validateOAuthToken(token: string) {
    const issuer = this.config
      .getOrThrow<string>('OAUTH_ISSUER')
      .replace(/\/$/, '');
    const audience =
      this.config.get<string>('OAUTH_RESOURCE_URI') ?? `${issuer}/api/v1/mcp`;

    const payload = await this.jwt.verifyAsync<{
      sub: string;
      email: string;
      scope?: string;
      client_id?: string;
    }>(token, {
      secret: this.config.getOrThrow<string>('JWT_MCP_SECRET'),
      issuer,
      audience,
    });

    const scopes = (payload.scope ?? '').split(' ');
    if (!scopes.includes('mcp')) {
      throw new UnauthorizedException('token missing mcp scope');
    }
    return {
      id: payload.sub,
      email: payload.email,
      clientId: payload.client_id,
    };
  }

  private writeChallenge(context: ExecutionContext): void {
    const issuer = this.config
      .getOrThrow<string>('OAUTH_ISSUER')
      .replace(/\/$/, '');
    const metadataUrl = `${issuer}/.well-known/oauth-protected-resource`;
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${metadataUrl}", error="invalid_token"`,
    );
  }
}
