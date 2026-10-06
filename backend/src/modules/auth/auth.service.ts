import { GatewayTimeoutException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { parseDurationMs } from '../../common/utils/duration';
import { sha256 } from '../../common/utils/hash';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { WEB_AUDIENCE } from './auth.constants';

// Precomputed once at module load (not per-request) so `login` always pays
// the same bcrypt.compare cost whether or not the email exists — otherwise
// short-circuit evaluation on `!user?.passwordHash` skips the ~100ms compare
// entirely for unknown emails / Google-only accounts, a measurable timing
// side-channel for account enumeration (audit SEC-XX).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Always returns the same message regardless of whether `dto.email` was
   * already registered — a distinguishable 409 ("already exists") or an
   * auto-login response would otherwise let anyone probe which emails have
   * MoFin accounts (audit SEC-XX). No auto-login on success: the client must
   * log in separately, which is what keeps the response uniform.
   */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const existing = await this.usersService.findByEmail(dto.email);
    if (!existing) {
      try {
        await this.usersService.createUser({ email: dto.email, displayName: dto.displayName, passwordHash });
      } catch (err) {
        // A concurrent registration of the same new email lost the race and
        // hit the unique constraint — still not a signal worth exposing.
        const isDuplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!isDuplicate) throw err;
      }
    }
    return { message: 'If this email can be used, your account has been created. Please log in.' };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    // No `&&`/early-return short-circuit before this — bcrypt.compare must run
    // unconditionally (against a dummy hash when there's no real one) so a
    // nonexistent email doesn't respond measurably faster than a real one.
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user?.passwordHash || !passwordMatches) {
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
      claims.email_verified !== true
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
