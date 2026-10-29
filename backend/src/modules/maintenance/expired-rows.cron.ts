import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** An expired credential stays this long, so a late "expired" answer still has its row. */
const CREDENTIAL_GRACE_MS = 7 * DAY_MS;

/** Password reset rows are kept for audit (see PasswordResetToken), so they outlive their expiry longer. */
const PASSWORD_RESET_RETENTION_MS = 90 * DAY_MS;

/**
 * Deletes rows nothing can use any more: expired sessions, codes and tokens,
 * and expired analytics cache entries. Each table's expiresAt is indexed for
 * exactly this.
 *
 * No advisory lock: every delete is idempotent, so replicas running this
 * together only find less to delete.
 */
@Injectable()
export class ExpiredRowsCron {
  private readonly logger = new Logger(ExpiredRowsCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'UTC' })
  async run(): Promise<void> {
    await this.deleteExpired(new Date());
  }

  /** Returns how many rows it deleted, by table. */
  async deleteExpired(now: Date): Promise<Record<string, number>> {
    const credentialCutoff = new Date(now.getTime() - CREDENTIAL_GRACE_MS);
    const resetCutoff = new Date(now.getTime() - PASSWORD_RESET_RETENTION_MS);
    const expiredBefore = (cutoff: Date) => ({ expiresAt: { lt: cutoff } });

    const [caches, sessions, codes, refresh, oauthRefresh, resets] =
      await this.prisma.$transaction([
        this.prisma.analyticsCache.deleteMany({ where: expiredBefore(now) }),
        this.prisma.authSession.deleteMany({
          where: expiredBefore(credentialCutoff),
        }),
        this.prisma.authorizationCode.deleteMany({
          where: expiredBefore(credentialCutoff),
        }),
        this.prisma.refreshToken.deleteMany({
          where: expiredBefore(credentialCutoff),
        }),
        this.prisma.oAuthRefreshToken.deleteMany({
          where: expiredBefore(credentialCutoff),
        }),
        this.prisma.passwordResetToken.deleteMany({
          where: expiredBefore(resetCutoff),
        }),
      ]);

    const deleted = {
      analyticsCache: caches.count,
      authSession: sessions.count,
      authorizationCode: codes.count,
      refreshToken: refresh.count,
      oAuthRefreshToken: oauthRefresh.count,
      passwordResetToken: resets.count,
    };
    const total = Object.values(deleted).reduce((sum, n) => sum + n, 0);
    if (total > 0)
      this.logger.log(
        `Deleted ${total} expired row(s): ${JSON.stringify(deleted)}`,
      );
    return deleted;
  }
}
