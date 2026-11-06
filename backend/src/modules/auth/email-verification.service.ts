import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { sha256 } from '../../common/utils/hash';
import { PrismaService } from '../../database/prisma.service';
import { MailSender } from '../mail/mail-sender';

const LINK_TTL_MS = 24 * 60 * 60 * 1000;

export const INVALID_VERIFICATION_TOKEN_MESSAGE =
  'This verification link is invalid or has expired. Request a new one.';

/**
 * Proves control of the address like PasswordResetService: 32 random bytes, only the SHA-256
 * stored, one use, a new request supersedes the old. Signup never asks for it.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailSender,
    private readonly config: ConfigService,
  ) {}

  async sendLink(userId: string): Promise<{ alreadyVerified: boolean }> {
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
        },
      }),
    ]);

    const webUrl = this.config
      .get<string>('WEB_URL', 'http://localhost:3001')
      .replace(/\/$/, '');
    // In the fragment, so the token stays out of access logs and Referer headers.
    const link = `${webUrl}/verify-email#token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: 'Verify your MoFin email',
      text: [
        'Open this link within 24 hours to verify your email address:',
        link,
        '',
        "If you didn't ask for this, ignore this email.",
      ].join('\n'),
      html: [
        `<p><a href="${link}">Verify your email address</a> (the link works once, within 24 hours).</p>`,
        "<p>If you didn't ask for this, ignore this email.</p>",
      ].join('\n'),
    });
    return { alreadyVerified: false };
  }

  async verify(token: string): Promise<{ message: string }> {
    const now = new Date();
    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt <= now) {
      throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
    }

    await this.prisma.$transaction(async (tx) => {
      // Claimed atomically, so two redemptions can't both pass.
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1)
        throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
      await tx.user.update({
        where: { id: stored.userId },
        data: { emailVerifiedAt: now },
      });
    });
    return { message: 'Your email is verified.' };
  }
}
