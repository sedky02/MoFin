import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** The lock transaction idles while the work runs, so it must outlive the work. */
const LOCK_TRANSACTION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Runs `work` only if no other process holds the Postgres advisory lock `key`,
 * so a @Cron job that @nestjs/schedule fires on every replica runs once.
 * Returns false, without running `work`, when another instance holds it.
 *
 * It is a transaction lock (pg_try_advisory_xact_lock), held by one
 * interactive transaction for the whole run. A session lock would be taken and
 * released through the connection pool, possibly on different connections, and
 * could stay held on the first one and silently skip every later run. A
 * transaction lock is released by Postgres on commit, rollback or a dropped
 * connection.
 */
export async function withAdvisoryLock(
  prisma: PrismaService,
  key: number,
  work: () => Promise<void>,
): Promise<boolean> {
  return prisma.$transaction(
    async (lockDb: Prisma.TransactionClient) => {
      const rows = await lockDb.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${key}) AS locked
      `;
      if (rows[0]?.locked !== true) return false;
      await work();
      return true;
    },
    { timeout: LOCK_TRANSACTION_TIMEOUT_MS },
  );
}
