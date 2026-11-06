import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { parseDurationMs } from '../../common/utils/duration';
import { sha256 } from '../../common/utils/hash';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { WEB_AUDIENCE } from './auth.constants';

// Computed once at load so login always pays the same bcrypt cost, or unknown emails would answer
// measurably faster (account enumeration).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  randomBytes(32).toString('hex'),
  12,
);

// How long a just-rotated refresh token still gets its successor back
// instead of counting as reuse (B-22).
const ROTATION_GRACE_MS = 30_000;

export interface GoogleIdentity {
  googleId: string;
  email: string;
  displayName?: string;
}

export const GOOGLE_ONLY_PASSWORD_MESSAGE =
  'This account signs in with Google, so it has no password to change.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Always the same message, whether or not the email exists, and no auto-login, so responses can't
   * be used to probe for accounts.
   */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const existing = await this.usersService.findByEmail(dto.email);
    if (!existing) {
      try {
        await this.usersService.createUser({
          email: dto.email,
          displayName: dto.displayName,
          passwordHash,
        });
      } catch (err) {
        // A concurrent registration of the same new email lost the race and
        // hit the unique constraint — still not a signal worth exposing.
        const isDuplicate =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';
        if (!isDuplicate) throw err;
      }
    }
    return {
      message:
        'If this email can be used, your account has been created. Please log in.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    // bcrypt.compare runs unconditionally (against a dummy hash when none), so unknown emails don't
    // answer faster.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user?.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(
      user.id,
      user.email,
      randomBytes(16).toString('hex'),
    );
  }

  /**
   * Rotates on every use; presenting a rotated token (a theft signal) revokes the family. Within
   * ROTATION_GRACE_MS the same successor is returned, since tabs race a rotation.
   */
  async refreshTokens(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    const successor = this.successorOf(refreshToken);

    if (stored.revokedAt || stored.rotatedToId) {
      const retried = await this.reissueRecentRotation(stored, successor);
      if (retried) return retried;
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    // Its data is about to be deleted; the access token it has dies on its own.
    if (demoHasEnded(user))
      throw new UnauthorizedException('This demo has ended');

    // Claim the token and create its successor in one step, so two concurrent
    // refreshes with the same token can't both rotate it.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null, rotatedToId: null },
        data: { revokedAt: new Date(), rotatedToId: sha256(successor) },
      });
      if (count === 0) return false;
      await tx.refreshToken.create({
        data: this.refreshTokenRow(successor, user.id, stored.familyId),
      });
      return true;
    });
    if (!claimed) {
      // A concurrent refresh with the same token won: hand out its successor.
      const current = await this.prisma.refreshToken.findUnique({
        where: { id: stored.id },
      });
      const retried =
        current && (await this.reissueRecentRotation(current, successor));
      if (retried) return retried;
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      accessToken: await this.signAccessToken(user.id, user.email),
      refreshToken: successor,
    };
  }

  /** Null unless the token was rotated within the grace window and its successor is still live. */
  private async reissueRecentRotation(
    stored: { revokedAt: Date | null; rotatedToId: string | null },
    successor: string,
  ) {
    if (!stored.revokedAt || !stored.rotatedToId) return null;
    if (Date.now() - stored.revokedAt.getTime() > ROTATION_GRACE_MS)
      return null;
    if (stored.rotatedToId !== sha256(successor)) return null;

    const next = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: stored.rotatedToId },
    });
    if (
      !next ||
      next.revokedAt ||
      next.rotatedToId ||
      next.expiresAt < new Date()
    )
      return null;

    const user = await this.prisma.user.findUnique({
      where: { id: next.userId },
    });
    if (!user || demoHasEnded(user)) return null;

    return {
      accessToken: await this.signAccessToken(user.id, user.email),
      refreshToken: successor,
    };
  }

  /**
   * Deterministic (HMAC with REFRESH_TOKEN_SECRET) so a retry in the grace window gets the same
   * successor; login tokens stay random.
   */
  private successorOf(refreshToken: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
    )
      .update(refreshToken)
      .digest('base64url');
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!stored) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Signs out every other web session and spends outstanding reset links. A wrong current password
   * is a 400, not a 401: the BFF reads 401 as "session over".
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.passwordHash)
      throw new BadRequestException(GOOGLE_ONLY_PASSWORD_MESSAGE);

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw fieldError('currentPassword', 'The current password is incorrect.');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw fieldError(
        'newPassword',
        'Choose a password different from the current one.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const current = dto.refreshToken
      ? await this.prisma.refreshToken.findUnique({
          where: { tokenHash: sha256(dto.refreshToken) },
        })
      : null;
    const keepFamilyId =
      current?.userId === userId ? current.familyId : undefined;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(keepFamilyId ? { familyId: { not: keepFamilyId } } : {}),
        },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
    });

    return { message: 'Password changed.' };
  }

  /** Access tokens already issued keep working until their short TTL runs out. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * The BFF calls this server-to-server, so the id_token comes straight from Google over TLS; its
   * claims are validated without a separate JWKS signature check.
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
        // 10s: a one-off external call, not the BFF proxy path; a hung request must not hang this
        // one.
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

    const { id_token: idToken } = (await tokenRes.json()) as {
      id_token?: string;
    };
    if (!idToken)
      throw new UnauthorizedException('Google response missing id_token');

    const claims = decodeJwtPayload(idToken);
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (
      claims.aud !== clientId ||
      !validIssuers.includes(String(claims.iss)) ||
      typeof claims.exp !== 'number' ||
      claims.exp * 1000 < Date.now() ||
      typeof claims.sub !== 'string' ||
      !claims.sub ||
      typeof claims.email !== 'string' ||
      !claims.email ||
      claims.email_verified !== true
    ) {
      throw new UnauthorizedException('Invalid Google identity token');
    }

    return this.signInWithGoogle({
      googleId: claims.sub,
      email: claims.email,
      displayName: typeof claims.name === 'string' ? claims.name : undefined,
    });
  }

  /**
   * Links by googleId, else by the account with the same email, else creates a passwordless user.
   * The address counts as verified.
   */
  async signInWithGoogle(identity: GoogleIdentity) {
    const { googleId, displayName } = identity;
    const email = identity.email.trim().toLowerCase();

    let user = await this.prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      user = byEmail
        ? await this.linkGoogle(byEmail, googleId)
        : await this.usersService.createUser({
            email,
            googleId,
            displayName,
            emailVerifiedAt: new Date(),
          });
    }

    return this.startSession(user);
  }

  /**
   * Registering never proved the address, so an unverified account may belong to someone else: its
   * password and sessions go. A real owner can reset the password.
   */
  private linkGoogle(
    user: { id: string; emailVerifiedAt: Date | null },
    googleId: string,
  ) {
    if (user.emailVerifiedAt) {
      return this.prisma.user.update({
        where: { id: user.id },
        data: { googleId },
      });
    }
    const now = new Date();
    const live = { userId: user.id, revokedAt: null };
    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: live,
        data: { revokedAt: now },
      });
      await tx.oAuthRefreshToken.updateMany({
        where: live,
        data: { revokedAt: now },
      });
      await tx.authSession.deleteMany({ where: { userId: user.id } });
      return tx.user.update({
        where: { id: user.id },
        data: { googleId, emailVerifiedAt: now, passwordHash: null },
      });
    });
  }

  startSession(user: { id: string; email: string }) {
    return this.issueTokens(
      user.id,
      user.email,
      randomBytes(16).toString('hex'),
    );
  }

  async liveSessionUser(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (
      !stored ||
      stored.revokedAt ||
      stored.rotatedToId ||
      stored.expiresAt < new Date()
    )
      return null;
    return stored.user;
  }

  /**
   * familyId is fresh per login, so logout or reuse detection can revoke every token from one login
   * in one update.
   */
  private async issueTokens(userId: string, email: string, familyId: string) {
    const accessToken = await this.signAccessToken(userId, email);
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: this.refreshTokenRow(refreshToken, userId, familyId),
    });
    return { accessToken, refreshToken };
  }

  private signAccessToken(userId: string, email: string): Promise<string> {
    const issuer = this.config
      .getOrThrow<string>('OAUTH_ISSUER')
      .replace(/\/$/, '');
    return this.jwtService.signAsync(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
        issuer,
        audience: WEB_AUDIENCE,
      },
    );
  }

  private refreshTokenRow(
    refreshToken: string,
    userId: string,
    familyId: string,
  ) {
    const refreshTtlMs = parseDurationMs(
      this.config.get<string>('JWT_REFRESH_TTL', '30d'),
    );
    return {
      tokenHash: sha256(refreshToken),
      userId,
      familyId,
      expiresAt: new Date(Date.now() + refreshTtlMs),
    };
  }
}

/** A temporary demo user past its expiry (cleanup may not have run yet). */
export function demoHasEnded(
  user: { isDemo: boolean; expiresAt: Date | null },
  now = new Date(),
): boolean {
  return user.isDemo && user.expiresAt !== null && user.expiresAt <= now;
}

/** A 400 shaped like ZodValidationPipe's, so the form shows it on `path`. */
function fieldError(path: string, message: string): BadRequestException {
  return new BadRequestException({
    message: 'Validation failed',
    errors: [{ path, message }],
  });
}

/** Decode (without signature verification) the payload of a JWT. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) throw new UnauthorizedException('Malformed id_token');
  try {
    return JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  } catch {
    throw new UnauthorizedException('Malformed id_token');
  }
}
