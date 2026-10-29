import { ExpiredRowsCron } from './expired-rows.cron';

describe('ExpiredRowsCron', () => {
  const now = new Date('2026-10-29T03:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;

  function setup() {
    const table = (count: number) => ({
      deleteMany: jest.fn((args: unknown) => ({ args, count })),
    });
    const prisma = {
      analyticsCache: table(4),
      authSession: table(3),
      authorizationCode: table(2),
      refreshToken: table(5),
      oAuthRefreshToken: table(1),
      passwordResetToken: table(6),
      $transaction: jest.fn(async (ops: { count: number }[]) => ops),
    };
    return { prisma, cron: new ExpiredRowsCron(prisma as never) };
  }

  const cutoffOf = (table: { deleteMany: jest.Mock }) =>
    (
      table.deleteMany.mock.calls[0][0] as {
        where: { expiresAt: { lt: Date } };
      }
    ).where.expiresAt.lt;

  it('deletes expired rows and reports the count per table', async () => {
    const { cron } = setup();
    expect(await cron.deleteExpired(now)).toEqual({
      analyticsCache: 4,
      authSession: 3,
      authorizationCode: 2,
      refreshToken: 5,
      oAuthRefreshToken: 1,
      passwordResetToken: 6,
    });
  });

  it('drops cache entries as soon as they expire', async () => {
    const { cron, prisma } = setup();
    await cron.deleteExpired(now);
    expect(cutoffOf(prisma.analyticsCache)).toEqual(now);
  });

  it('keeps expired credentials for a week and reset rows for 90 days', async () => {
    const { cron, prisma } = setup();
    await cron.deleteExpired(now);
    for (const table of [
      prisma.authSession,
      prisma.authorizationCode,
      prisma.refreshToken,
      prisma.oAuthRefreshToken,
    ]) {
      expect(cutoffOf(table).getTime()).toBe(now.getTime() - 7 * DAY);
    }
    expect(cutoffOf(prisma.passwordResetToken).getTime()).toBe(
      now.getTime() - 90 * DAY,
    );
  });

  it('runs every delete in one transaction', async () => {
    const { cron, prisma } = setup();
    await cron.deleteExpired(now);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
