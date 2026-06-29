import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UsersService } from '../users/users.service';
import { CreateApiKeyDto, LoginDto, RegisterDto } from './dto/auth.dto';

interface RefreshPayload {
  sub: string;
  email: string;
}

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
    return this.issueTokens(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id, user.email);
  }

  /**
   * Stateless refresh: the refresh token is verified against its own secret and
   * new tokens are minted. Note this cannot revoke a leaked refresh token before
   * expiry — persisting/rotating refresh tokens is a deliberate follow-up.
   */
  async refreshTokens(refreshToken: string) {
    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens(payload.sub, payload.email);
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

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
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

    return this.issueTokens(user.id, user.email);
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

  private async issueTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '30d'),
      }),
    ]);

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
