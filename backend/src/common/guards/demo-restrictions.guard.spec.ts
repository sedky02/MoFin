import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEMO_BLOCKED_KEY, DEMO_QUOTA_KEY } from '../decorators/demo.decorator';
import { demoEmail } from '../utils/demo-identity';
import { DemoRestrictionsGuard } from './demo-restrictions.guard';

const DEMO = { id: 'demo-user', email: demoEmail('abc') };
const REAL = { id: 'real-user', email: 'someone@example.com' };

function contextFor(
  user: { id: string; email: string } | undefined,
  metadata: Record<string, unknown>,
) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata))
    Reflect.defineMetadata(key, value, handler);
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => class {},
  } as never;
}

function makeGuard(draftCount = 0) {
  const prisma = {
    draftTransaction: { count: jest.fn(async () => draftCount) },
  };
  const config = { getOrThrow: jest.fn(() => 3) };
  const guard = new DemoRestrictionsGuard(
    new Reflector(),
    prisma as never,
    config as never,
  );
  return { guard, prisma };
}

describe('DemoRestrictionsGuard', () => {
  it('blocks demo users on @DemoBlocked routes', async () => {
    const { guard } = makeGuard();
    const error = await guard
      .canActivate(contextFor(DEMO, { [DEMO_BLOCKED_KEY]: true }))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error).toMatchObject({ response: { code: 'DEMO_BLOCKED' } });
  });

  it('lets real users and signed-out requests through the same routes', async () => {
    const { guard, prisma } = makeGuard(99);
    const metadata = {
      [DEMO_BLOCKED_KEY]: true,
      [DEMO_QUOTA_KEY]: 'ai-drafts',
    };
    await expect(guard.canActivate(contextFor(REAL, metadata))).resolves.toBe(
      true,
    );
    await expect(
      guard.canActivate(contextFor(undefined, metadata)),
    ).resolves.toBe(true);
    expect(prisma.draftTransaction.count).not.toHaveBeenCalled();
  });

  it('lets demo users use every other route', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(contextFor(DEMO, {}))).resolves.toBe(true);
  });

  it('caps a demo user’s AI drafts, counted in the database', async () => {
    const under = makeGuard(2);
    await expect(
      under.guard.canActivate(
        contextFor(DEMO, { [DEMO_QUOTA_KEY]: 'ai-drafts' }),
      ),
    ).resolves.toBe(true);
    expect(under.prisma.draftTransaction.count).toHaveBeenCalledWith({
      where: { userId: DEMO.id },
    });

    const at = makeGuard(3);
    await expect(
      at.guard.canActivate(contextFor(DEMO, { [DEMO_QUOTA_KEY]: 'ai-drafts' })),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: 'DEMO_LIMIT' },
    });
  });
});
