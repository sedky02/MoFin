import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** The lock transaction idles while the work runs, so it must outlive the work. */
const LOCK_TRANSACTION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Runs `work` only if no other process holds the advisory lock, so a @Cron job fires once across
 * replicas. A transaction lock, since a pooled session lock could stay held.
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
