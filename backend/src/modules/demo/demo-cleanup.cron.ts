import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { DEMO_EMAIL_DOMAIN } from '../../common/utils/demo-identity';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';

const BATCH_SIZE = 50;

/**
 * Deletes expired demo users via UsersService.deleteUserData; idempotent, so no advisory lock. Only
 * rows that are demo users twice over (flag and email domain) are selected.
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
