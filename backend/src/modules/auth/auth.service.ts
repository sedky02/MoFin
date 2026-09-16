import { GatewayTimeoutException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { parseDurationMs } from '../../common/utils/duration';
import { sha256 } from '../../common/utils/hash';
import { UsersService } from '../users/users.service';
import { CreateApiKeyDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { WEB_AUDIENCE } from './auth.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.createUser({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash,
    });
    return this.issueTokens(user.id, user.email, randomBytes(16).toString('hex'));
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id, user.email, randomBytes(16).toString('hex'));
  }

  /**
   * Refresh tokens are opaque random strings persisted (hashed) server-side
   * with a familyId, mirroring OAuthService.exchangeRefreshToken: rotate on
   * every use, and if a token is presented that was already revoked/rotated
   * (reuse — the classic signal of a stolen token), revoke the whole family
   * so the thief's and the legitimate holder's tokens both stop working.
   */
  async refreshTokens(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt || stored.rotatedToId) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    const next = await this.issueTokens(user.id, user.email, stored.familyId);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), rotatedToId: sha256(next.refreshToken) },
    });

    return next;
  }

  /** Revokes every refresh token in the presented token's family. */
  async logout(refreshToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!stored) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Exchange a Google authorization code for MoFin tokens. The web BFF calls
   * this server-to-server after Google redirects back, so the id_token arrives
   * directly from Google's token endpoint over TLS — we validate its claims
   * (aud/iss/exp/email_verified) without a separate JWKS signature check, which
   * is acceptable for the authorization-code flow over a trusted channel.
   */
  async loginWithGoogle(code: string, redirectUri: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const tokenUrl = this.config.get<string>('GOOGLE_TOKEN_URL');
    if (!clientId || !clientSecret || !tokenUrl) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    let tokenRes: Response;
    try {
      tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
        // A hung Google request must not hang this request indefinitely —
        // 10s since this is a one-off external call, not the user-facing BFF
        // proxy path (audit PERF-XX).
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new GatewayTimeoutException('Google sign-in timed out');
      }
      throw new ServiceUnavailableException('Could not reach Google');
    }
    if (!tokenRes.ok) {
      throw new UnauthorizedException('Google code exchange failed');
    }

    const { id_token: idToken } = (await tokenRes.json()) as { id_token?: string };
    if (!idToken) throw new UnauthorizedException('Google response missing id_token');

    const claims = decodeJwtPayload(idToken);
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (
      claims.aud !== clientId ||
      !validIssuers.includes(String(claims.iss)) ||
      typeof claims.exp !== 'number' ||
      claims.exp * 1000 < Date.now() ||
      !claims.sub ||
      !claims.email ||
      claims.email_verified === false
    ) {
      throw new UnauthorizedException('Invalid Google identity token');
    }

    const googleId = String(claims.sub);
    const email = String(claims.email).trim().toLowerCase();
    const displayName = typeof claims.name === 'string' ? claims.name : undefined;

    // Link by googleId, else by existing email, else create a passwordless user.
    let user = await this.prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      user = byEmail
        ? await this.prisma.user.update({ where: { id: byEmail.id }, data: { googleId } })
        : await this.prisma.user.create({ data: { email, googleId, displayName } });
    }

    return this.issueTokens(user.id, user.email, randomBytes(16).toString('hex'));
  }

  /**
   * Key format: `mcp_<keyId>.<secret>`. Only the secret is hashed; the keyId is a
   * plaintext lookup handle so validation is a single indexed read + one bcrypt
   * compare instead of scanning every key in the system (audit A4).
   */
  async createApiKey(userId: string, dto: CreateApiKeyDto) {
    const secret = randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(secret, 12);
    const apiKey = await this.prisma.apiKey.create({
      data: { userId, name: dto.name, keyHash },
      select: { id: true, name: true, createdAt: true },
    });

    return { ...apiKey, apiKey: `mcp_${apiKey.id}.${secret}` };
  }

  async validateApiKey(rawKey: string): Promise<AuthenticatedUser> {
    const match = /^mcp_([^.]+)\.(.+)$/.exec(rawKey);
    if (!match) throw new UnauthorizedException('Invalid MCP API key');

    const [, keyId, secret] = match;
    const key = await this.prisma.apiKey.findUnique({ where: { id: keyId }, include: { user: true } });
    if (!key || key.revokedAt || !(await bcrypt.compare(secret, key.keyHash))) {
      throw new UnauthorizedException('Invalid MCP API key');
    }

    await this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return { id: key.user.id, email: key.user.email };
  }

  /**
   * Mints a fresh access token (JWT) and refresh token (opaque, persisted
   * hashed) for `userId`, linking the new refresh token into `familyId` —
   * a fresh random id on login/register, or the presented token's own family
   * when rotating during refresh, so `logout`/reuse-detection can revoke
   * every token ever issued from a single login in one update.
   */
  private async issueTokens(userId: string, email: string, familyId: string) {
    const issuer = this.config.getOrThrow<string>('OAUTH_ISSUER').replace(/\/$/, '');
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
        issuer,
        audience: WEB_AUDIENCE,
      },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const refreshTtlMs = parseDurationMs(this.config.get<string>('JWT_REFRESH_TTL', '30d'));
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        userId,
        familyId,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });

    return { accessToken, refreshToken };
  }
}

/** Decode (without signature verification) the payload of a JWT. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) throw new UnauthorizedException('Malformed id_token');
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new UnauthorizedException('Malformed id_token');
  }
}
