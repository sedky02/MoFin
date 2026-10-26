import { Prisma } from '@prisma/client';
import { DEMO_EMAIL_DOMAIN } from '../../common/utils/demo-identity';
import { DemoCleanupCron } from './demo-cleanup.cron';

const NOW = new Date('2026-10-26T12:00:00.000Z');

function makeCron(pages: { id: string }[][]) {
  const prisma = {
    user: {
      findMany: jest.fn(async () => pages.shift() ?? []),
    },
  };
  const usersService = { deleteUserData: jest.fn(async () => undefined) };
  const cron = new DemoCleanupCron(prisma as never, usersService as never);
  return { cron, prisma, usersService };
}

describe('DemoCleanupCron', () => {
  it('only ever selects expired users that are demo users by flag and by email', async () => {
    const { cron, prisma } = makeCron([]);

    await cron.deleteExpired(NOW);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDemo: true,
          email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` },
          expiresAt: { lte: NOW },
          id: { notIn: [] },
        },
      }),
    );
  });

  it('deletes each expired demo user with everything it owns', async () => {
    const { cron, usersService } = makeCron([[{ id: 'a' }, { id: 'b' }]]);

    expect(await cron.deleteExpired(NOW)).toBe(2);
    expect(usersService.deleteUserData).toHaveBeenCalledWith('a');
    expect(usersService.deleteUserData).toHaveBeenCalledWith('b');
  });

  it('moves on when another instance already deleted a user', async () => {
    const { cron, usersService } = makeCron([[{ id: 'gone' }, { id: 'b' }]]);
    usersService.deleteUserData.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    expect(await cron.deleteExpired(NOW)).toBe(1);
  });

  it('skips a user that fails for the rest of the run instead of retrying it forever', async () => {
    const batch = Array.from({ length: 50 }, (_, i) => ({ id: `u${i}` }));
    const { cron, prisma, usersService } = makeCron([batch, []]);
    usersService.deleteUserData.mockRejectedValueOnce(new Error('db hiccup'));

    expect(await cron.deleteExpired(NOW)).toBe(49);
    const second = (
      prisma.user.findMany.mock.calls as unknown as [
        { where: { id: { notIn: string[] } } },
      ][]
    )[1][0];
    expect(second.where.id.notIn).toEqual(['u0']);
  });
});
