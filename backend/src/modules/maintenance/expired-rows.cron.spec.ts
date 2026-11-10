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
      emailVerificationToken: table(7),
      accountInvitation: table(8),
      oAuthClient: table(9),
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
      emailVerificationToken: 7,
      accountInvitation: 8,
      oAuthClient: 9,
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
    for (const table of [
      prisma.passwordResetToken,
      prisma.emailVerificationToken,
      prisma.accountInvitation,
    ]) {
      expect(cutoffOf(table).getTime()).toBe(now.getTime() - 90 * DAY);
    }
  });

  it('runs every delete in one transaction', async () => {
    const { cron, prisma } = setup();
    await cron.deleteExpired(now);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('deletes OAuth clients older than a day that never got a grant, code or token', async () => {
    const { cron, prisma } = setup();
    await cron.deleteExpired(now);
    expect(prisma.oAuthClient.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date(now.getTime() - DAY) },
        grants: { none: {} },
        authorizationCodes: { none: {} },
        refreshTokens: { none: {} },
      },
    });
  });

  it('deletes clients after the codes and tokens that might reference them', async () => {
    const { cron, prisma } = setup();
    await cron.deleteExpired(now);
    const ops = prisma.$transaction.mock.calls[0][0] as unknown[];
    const order = (table: { deleteMany: jest.Mock }) =>
      ops.indexOf(table.deleteMany.mock.results[0].value);
    expect(order(prisma.oAuthClient)).toBeGreaterThan(
      order(prisma.authorizationCode),
    );
    expect(order(prisma.oAuthClient)).toBeGreaterThan(
      order(prisma.oAuthRefreshToken),
    );
  });
});
