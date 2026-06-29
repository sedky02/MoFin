import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizeQueryDto, RegisterClientDto } from './dto/oauth.dto';

export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

const SUPPORTED_SCOPE = 'mcp';

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // --- Config-derived URLs (issuer comes from config, never the Host header) ---

  get issuer(): string {
    return this.config.getOrThrow<string>('OAUTH_ISSUER').replace(/\/$/, '');
  }

  /** Canonical MCP resource URL, used as the access-token audience. */
  get resourceUri(): string {
    return (
      this.config.get<string>('OAUTH_RESOURCE_URI') ?? `${this.issuer}/api/v1/mcp`
    );
  }

  authorizationServerMetadata() {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/api/v1/oauth/authorize`,
      token_endpoint: `${this.issuer}/api/v1/oauth/token`,
      registration_endpoint: `${this.issuer}/api/v1/oauth/register`,
      scopes_supported: [SUPPORTED_SCOPE],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    };
  }

  protectedResourceMetadata() {
    return {
      resource: this.resourceUri,
      authorization_servers: [this.issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: [SUPPORTED_SCOPE],
    };
  }

  // --- Dynamic Client Registration (RFC 7591) ---

  async registerClient(dto: RegisterClientDto) {
    const allowedHosts = this.config
      .getOrThrow<string>('OAUTH_ALLOWED_REDIRECT_HOSTS')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);

    for (const uri of dto.redirect_uris) {
      this.assertRedirectUriAllowed(uri, allowedHosts);
    }

    const clientId = `mcp-client-${randomBytes(16).toString('hex')}`;
    const client = await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientName: dto.client_name,
        redirectUris: dto.redirect_uris,
        grantTypes: dto.grant_types ?? ['authorization_code', 'refresh_token'],
        responseTypes: dto.response_types ?? ['code'],
        scope: dto.scope ?? SUPPORTED_SCOPE,
        tokenEndpointAuthMethod: 'none',
      },
    });

    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method: 'none',
      scope: client.scope,
      client_name: client.clientName ?? undefined,
    };
  }

  private assertRedirectUriAllowed(uri: string, allowedHosts: string[]) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new BadRequestException('invalid redirect_uri');
    }
    const isLocalhost = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    const devAllowed = this.issuer.startsWith('http://') && isLocalhost;
    if (parsed.protocol !== 'https:' && !devAllowed) {
      throw new BadRequestException('redirect_uri must be https');
    }
    if (!isLocalhost && !allowedHosts.includes(parsed.hostname)) {
      throw new BadRequestException(`redirect_uri host not allowed: ${parsed.hostname}`);
    }
  }

  // --- Authorization endpoint helpers ---

  async getClientOrThrow(clientId: string) {
    const client = await this.prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) throw new BadRequestException('unknown client_id');
    return client;
  }

  /** Exact-string match against the registered set — no prefix/wildcard matching. */
  assertRedirectUriRegistered(client: { redirectUris: string[] }, redirectUri: string) {
    if (!client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException('redirect_uri does not match a registered URI');
    }
  }

  async hasGrant(userId: string, clientId: string): Promise<boolean> {
    const grant = await this.prisma.oAuthGrant.findUnique({
      where: { userId_clientId: { userId, clientId } },
    });
    return !!grant;
  }

  async rememberGrant(userId: string, clientId: string, scope: string) {
    await this.prisma.oAuthGrant.upsert({
      where: { userId_clientId: { userId, clientId } },
      create: { userId, clientId, scope },
      update: { scope },
    });
  }

  /**
   * Issue a single-use authorization code. The raw code is returned to the caller
   * (placed in the redirect); only its hash is persisted.
   */
  async issueAuthorizationCode(userId: string, q: AuthorizeQueryDto): Promise<string> {
    const rawCode = randomBytes(32).toString('base64url');
    const ttl = this.config.getOrThrow<number>('OAUTH_AUTH_CODE_TTL');
    await this.prisma.authorizationCode.create({
      data: {
        code: sha256(rawCode),
        clientId: q.client_id,
        userId,
        redirectUri: q.redirect_uri,
        codeChallenge: q.code_challenge,
        codeChallengeMethod: q.code_challenge_method,
        scope: q.scope ?? SUPPORTED_SCOPE,
        resource: q.resource ?? this.resourceUri,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return rawCode;
  }

  // --- Token endpoint ---

  async exchangeAuthorizationCode(params: {
    code: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
  }): Promise<OAuthTokenResponse> {
    const codeHash = sha256(params.code);

    // Single-use: atomically claim the code by setting usedAt only if still null.
    const claim = await this.prisma.authorizationCode.updateMany({
      where: { code: codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    const record = await this.prisma.authorizationCode.findUnique({
      where: { code: codeHash },
    });

    if (!record || claim.count === 0) {
      // Either unknown or already used → reject (replay defense).
      throw new BadRequestException({ error: 'invalid_grant', error_description: 'code invalid or already used' });
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException({ error: 'invalid_grant', error_description: 'code expired' });
    }
    if (record.clientId !== params.clientId || record.redirectUri !== params.redirectUri) {
      throw new BadRequestException({ error: 'invalid_grant', error_description: 'client/redirect mismatch' });
    }

    // PKCE: BASE64URL(SHA256(verifier)) must equal the stored challenge.
    const expected = base64urlSha256(params.codeVerifier);
    if (record.codeChallengeMethod !== 'S256' || expected !== record.codeChallenge) {
      throw new BadRequestException({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) throw new BadRequestException({ error: 'invalid_grant' });

    return this.mintTokens({
      userId: user.id,
      email: user.email,
      clientId: record.clientId,
      scope: record.scope,
      resource: record.resource ?? this.resourceUri,
      familyId: randomBytes(16).toString('hex'),
    });
  }

  async exchangeRefreshToken(params: {
    refreshToken: string;
    clientId: string;
  }): Promise<OAuthTokenResponse> {
    const tokenHash = sha256(params.refreshToken);
    const stored = await this.prisma.oAuthRefreshToken.findUnique({ where: { tokenHash } });
    if (!stored) {
      throw new BadRequestException({ error: 'invalid_grant', error_description: 'unknown refresh token' });
    }

    // Reuse detection: a revoked or already-rotated token signals theft →
    // revoke the entire family.
    if (stored.revokedAt || stored.rotatedToId) {
      await this.prisma.oAuthRefreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new BadRequestException({ error: 'invalid_grant', error_description: 'refresh token reuse detected' });
    }
    if (stored.expiresAt < new Date() || stored.clientId !== params.clientId) {
      throw new BadRequestException({ error: 'invalid_grant', error_description: 'refresh token invalid' });
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new BadRequestException({ error: 'invalid_grant' });

    const next = await this.mintTokens({
      userId: user.id,
      email: user.email,
      clientId: stored.clientId,
      scope: stored.scope,
      resource: stored.resource ?? this.resourceUri,
      familyId: stored.familyId,
    });

    // Rotate: revoke the presented token and link it to its successor.
    await this.prisma.oAuthRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), rotatedToId: sha256(next.refresh_token) },
    });

    return next;
  }

  private async mintTokens(params: {
    userId: string;
    email: string;
    clientId: string;
    scope: string;
    resource: string;
    familyId: string;
  }): Promise<OAuthTokenResponse> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const accessToken = await this.jwt.signAsync(
      {
        sub: params.userId,
        email: params.email,
        scope: params.scope,
        client_id: params.clientId,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessTtl,
        issuer: this.issuer,
        audience: params.resource,
      },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const refreshTtl = this.config.getOrThrow<number>('OAUTH_REFRESH_TTL');
    await this.prisma.oAuthRefreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        userId: params.userId,
        clientId: params.clientId,
        scope: params.scope,
        resource: params.resource,
        familyId: params.familyId,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: parseDurationSeconds(accessTtl),
      refresh_token: refreshToken,
      scope: params.scope,
    };
  }

  // --- Cross-origin login bridge ---

  /**
   * Called by the web BFF (authenticated with the user's backend access token).
   * Creates a backend authorize-session and returns a one-time handoff secret to
   * place in the consume redirect. The handoff secret is rotated at consume time
   * so the value that travels in the URL never remains the live cookie value.
   */
  async createHandoff(accessToken: string): Promise<string> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(accessToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('invalid access token');
    }
    const handoff = randomBytes(32).toString('base64url');
    const ttl = this.config.getOrThrow<number>('OAUTH_SESSION_TTL');
    await this.prisma.authSession.create({
      data: {
        sessionToken: sha256(handoff),
        userId: payload.sub,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return handoff;
  }

  /**
   * Consume a handoff secret: validate it, then rotate the session to a fresh
   * secret (single-use of the URL-exposed value) and return the new cookie value.
   */
  async consumeHandoff(handoff: string): Promise<string> {
    const session = await this.prisma.authSession.findUnique({
      where: { sessionToken: sha256(handoff) },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('invalid or expired handoff');
    }
    const fresh = randomBytes(32).toString('base64url');
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { sessionToken: sha256(fresh) },
    });
    return fresh;
  }

  /** Resolve a live session cookie value to the user, or null. */
  async resolveSession(cookieValue: string | undefined): Promise<{ id: string; email: string } | null> {
    if (!cookieValue) return null;
    const session = await this.prisma.authSession.findUnique({
      where: { sessionToken: sha256(cookieValue) },
    });
    if (!session || session.expiresAt < new Date()) return null;
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    return user ? { id: user.id, email: user.email } : null;
  }
}

// --- crypto helpers ---

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function base64urlSha256(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

/** Parse a JWT-style duration ('15m', '1h', '900s', '30d', or a number) to seconds. */
function parseDurationSeconds(ttl: string | number): number {
  if (typeof ttl === 'number') return ttl;
  const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
  return value * factor;
}
