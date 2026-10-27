import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { DEMO_EMAIL_DOMAIN } from '../../common/utils/demo-identity';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';

const BATCH_SIZE = 50;

/**
 * Deletes temporary demo users once they expire, with everything they own,
 * through the same ordered UsersService.deleteUserData an account deletion uses.
 *
 * No advisory lock: deleting an expired demo is idempotent, so when replicas
 * run this together, the one that finds a user already gone just moves on.
 * Only rows that are demo users twice over (the flag and the reserved email
 * domain) are ever selected, so a real account can't be caught by mistake.
 */
@Injectable()
export class DemoCleanupCron {
  private readonly logger = new Logger(DemoCleanupCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    await this.deleteExpired(new Date());
  }

  /** Returns how many demo users it deleted. */
  async deleteExpired(now: Date): Promise<number> {
    let deleted = 0;
    // Skipped for the rest of this run so one bad row can't loop forever.
    const failed: string[] = [];

    for (;;) {
      const expired = await this.prisma.user.findMany({
        where: {
          isDemo: true,
          email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` },
          expiresAt: { lte: now },
          id: { notIn: failed },
        },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: BATCH_SIZE,
      });
      if (expired.length === 0) break;

      for (const { id } of expired) {
        try {
          await this.usersService.deleteUserData(id);
          deleted++;
        } catch (error) {
          // Another instance deleted it first: nothing left to do.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2025'
          )
            continue;
          failed.push(id);
          this.logger.error(
            `Failed to delete expired demo user ${id}`,
            error as Error,
          );
        }
      }
      if (expired.length < BATCH_SIZE) break;
    }

    if (deleted > 0 || failed.length > 0)
      this.logger.log(
        `Deleted ${deleted} expired demo user(s)${failed.length ? `, ${failed.length} failed` : ''}`,
      );
    return deleted;
  }
}
