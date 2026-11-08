import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { runAfterResponse } from '../../common/utils/after-response';
import { sha256 } from '../../common/utils/hash';
import { PrismaService } from '../../database/prisma.service';
import { MailSender } from '../mail/mail-sender';

const LINK_TTL_MS = 24 * 60 * 60 * 1000;

export const INVALID_VERIFICATION_TOKEN_MESSAGE =
  'This verification link is invalid or has expired. Request a new one.';

export type SignupClient = 'web' | 'mobile';

export interface LinkOptions {
  /** Raw value from the signing-up browser's cookie; only its hash is stored. */
  browserBinding?: string;
  client?: SignupClient;
}

export interface VerificationUser {
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  isDemo: boolean;
  createdAt: Date;
}

export interface VerifiedEmail {
  userId: string;
  email: string;
  /** True only when the link was redeemed by the browser that signed up. */
  sameBrowser: boolean;
}

/**
 * Proves control of the address like PasswordResetService: 32 random bytes, only the SHA-256
 * stored, one use, a new request supersedes the old. Email/password accounts created from
 * EMAIL_VERIFICATION_REQUIRED_FROM must redeem one before they can sign in.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailSender,
    private readonly config: ConfigService,
  ) {}

  /** Google proves the address itself, demo accounts are throwaway, older accounts are exempt. */
  isRequiredFor(user: VerificationUser): boolean {
    if (user.emailVerifiedAt || !user.passwordHash || user.isDemo) return false;
    const requiredFrom = this.config.get<Date>(
      'EMAIL_VERIFICATION_REQUIRED_FROM',
    );
    return !requiredFrom || user.createdAt >= new Date(requiredFrom);
  }

  async sendLink(
    userId: string,
    options: LinkOptions = {},
  ): Promise<{ alreadyVerified: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (user.emailVerifiedAt) return { alreadyVerified: true };

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          tokenHash: sha256(token),
          userId,
          expiresAt: new Date(now.getTime() + LINK_TTL_MS),
          browserBindingHash: options.browserBinding
            ? sha256(options.browserBinding)
            : null,
        },
      }),
    ]);

    // In the fragment, so the token stays out of access logs and Referer headers.
    const fromApp = options.client === 'mobile' ? '&from=app' : '';
    const link = `${this.webUrl()}/verify-email#token=${token}${fromApp}`;
    await this.mail.send({
      to: user.email,
      subject: 'Verify your MoFin email',
      text: [
        'Open this link within 24 hours to verify your email address:',
        link,
        '',
        "If you didn't create a MoFin account, ignore this email.",
      ].join('\n'),
      html: [
        `<p><a href="${link}">Verify your email address</a> (the link works once, within 24 hours).</p>`,
        "<p>If you didn't create a MoFin account, ignore this email.</p>",
      ].join('\n'),
    });
    return { alreadyVerified: false };
  }

  /** Sign-up with an address that already has an account: tell the owner instead of the screen. */
  async sendAccountExistsNotice(email: string): Promise<void> {
    const webUrl = this.webUrl();
    await this.mail.send({
      to: email,
      subject: 'You already have a MoFin account',
      text: [
        'Someone tried to create a MoFin account with this email, but you already have one.',
        '',
        `Sign in: ${webUrl}/login`,
        `Forgot your password? Reset it: ${webUrl}/forgot-password`,
        '',
        "If this wasn't you, you can ignore this email. Nothing has changed.",
      ].join('\n'),
      html: [
        '<p>Someone tried to create a MoFin account with this email, but you already have one.</p>',
        `<p><a href="${webUrl}/login">Sign in</a> or, if you forgot your password, <a href="${webUrl}/forgot-password">reset it</a>.</p>`,
        "<p>If this wasn't you, you can ignore this email. Nothing has changed.</p>",
      ].join('\n'),
    });
  }

  /**
   * Public resend from the "check your email" screens. Runs after the response so a known and an
   * unknown email answer alike; only accounts still waiting for verification get a link.
   */
  resendInBackground(email: string, options: LinkOptions): void {
    runAfterResponse(
      this.logger,
      'Verification resend',
      this.resend(email, options),
    );
  }

  async resend(email: string, options: LinkOptions): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !this.isRequiredFor(user)) return;
    await this.sendLink(user.id, options);
  }

  /** Mail sent on behalf of an unauthenticated request: logged, never surfaced. */
  runInBackground(label: string, task: Promise<unknown>): void {
    runAfterResponse(this.logger, label, task);
  }

  async verify(token: string, browserBinding?: string): Promise<VerifiedEmail> {
    const now = new Date();
    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt <= now) {
      throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      // Claimed atomically, so two redemptions can't both pass.
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1)
        throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
      return tx.user.update({
        where: { id: stored.userId },
        data: { emailVerifiedAt: now },
        select: { id: true, email: true },
      });
    });

    const sameBrowser =
      !!stored.browserBindingHash &&
      !!browserBinding &&
      sha256(browserBinding) === stored.browserBindingHash;
    return { userId: user.id, email: user.email, sameBrowser };
  }

  private webUrl(): string {
    return this.config
      .get<string>('WEB_URL', 'http://localhost:3001')
      .replace(/\/$/, '');
  }
}
