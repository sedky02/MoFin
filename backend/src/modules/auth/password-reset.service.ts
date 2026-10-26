import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { parseDurationMs } from '../../common/utils/duration';
import { sha256 } from '../../common/utils/hash';
import { MailSender } from '../mail/mail-sender';
import { UsersService } from '../users/users.service';

export const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for this email, we have sent a link to reset its password.';
export const INVALID_RESET_TOKEN_MESSAGE =
  'This reset link is invalid or has expired. Request a new one.';

/**
 * Email-based password recovery.
 *
 * - The token is 32 random bytes; only its SHA-256 is stored, so reading the
 *   table never yields a working link (same scheme as refresh tokens).
 * - Single use: redeeming it sets `usedAt` in the same transaction that
 *   changes the password, guarded by `usedAt IS NULL`, so two concurrent
 *   redemptions can't both succeed.
 * - A new request supersedes any outstanding link for that user.
 * - A successful reset revokes every first-party refresh token of the user,
 *   signing out all web sessions. Access tokens already issued stay valid
 *   until their short TTL (JWT_ACCESS_TTL) runs out.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly mail: MailSender,
    private readonly config: ConfigService,
  ) {}

  /**
   * Starts `requestReset` without waiting for it. The HTTP response therefore
   * goes out before the user lookup, token write or SMTP round-trip, so a
   * known and an unknown email answer in the same time with the same body.
   * Failures are logged, never surfaced: the caller always gets 202.
   */
  requestResetInBackground(email: string): void {
    this.requestReset(email).catch((err: unknown) => {
      this.logger.error(
        `Password reset request could not be processed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  async requestReset(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    // Unknown email: nothing to do. Google-only accounts (no passwordHash) do
    // get a link: proving control of the inbox is what Google sign-in relies
    // on too, and it lets them add a password.
    if (!user) return;

    const token = randomBytes(32).toString('base64url');
    const ttlMs = parseDurationMs(
      this.config.get<string>('PASSWORD_RESET_TTL', '30m'),
    );
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          tokenHash: sha256(token),
          userId: user.id,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      }),
    ]);

    const webUrl = this.config
      .get<string>('WEB_URL', 'http://localhost:3001')
      .replace(/\/$/, '');
    // In the fragment, not the query string: the fragment is never sent to a
    // server, so the token stays out of access logs and Referer headers.
    const link = `${webUrl}/reset-password#token=${token}`;
    const minutes = Math.round(ttlMs / 60_000);

    await this.mail.send({
      to: user.email,
      subject: 'Reset your MoFin password',
      text: [
        'Someone asked to reset the password for your MoFin account.',
        '',
        `Open this link within ${minutes} minutes to choose a new password:`,
        link,
        '',
        "If you didn't ask for this, ignore this email. Your password won't change.",
      ].join('\n'),
      html: [
        '<p>Someone asked to reset the password for your MoFin account.</p>',
        `<p><a href="${link}">Choose a new password</a> (the link works once, within ${minutes} minutes).</p>`,
        "<p>If you didn't ask for this, ignore this email. Your password won't change.</p>",
      ].join('\n'),
    });
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const now = new Date();
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt <= now) {
      throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction(async (tx) => {
      // Claim the token atomically; a concurrent redemption that got here
      // first leaves count 0 and this one rolls back.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1)
        throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);

      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      });
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      // Any other outstanding link for this account is now stale.
      await tx.passwordResetToken.updateMany({
        where: { userId: stored.userId, usedAt: null },
        data: { usedAt: now },
      });
    });

    return {
      message: 'Your password has been reset. Sign in with your new password.',
    };
  }
}
