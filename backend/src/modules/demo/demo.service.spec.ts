import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isDemoEmail } from '../../common/utils/demo-identity';
import { SEED_TRANSACTION_OPTIONS } from '../../demo/demo-seeder';
import { DemoService } from './demo.service';

const TOKENS = { accessToken: 'access', refreshToken: 'refresh' };
const HOUR = 60 * 60_000;

function makeService(
  options: {
    env?: Record<string, string | number | undefined>;
    active?: number;
    liveUser?: unknown;
  } = {},
) {
  const env: Record<string, string | number | undefined> = {
    DEMO_ENABLED: 'true',
    DEMO_TTL_HOURS: 24,
    DEMO_MAX_ACTIVE: 200,
    ...options.env,
  };
  const config = {
    get: jest.fn((key: string) => env[key]),
    getOrThrow: jest.fn((key: string) => env[key]),
  };
  const tx = { name: 'tx' };
  const prisma = {
    user: { count: jest.fn(async () => options.active ?? 0) },
    $transaction: jest.fn(async (run: (client: unknown) => unknown) => run(tx)),
  };
  const usersService = {
    createUser: jest.fn(async (input: { email: string }) => ({
      id: 'demo-user',
      email: input.email,
    })),
  };
  const seeder = { seedUserData: jest.fn(async () => ({})) };
  const authService = {
    startSession: jest.fn(async () => TOKENS),
    liveSessionUser: jest.fn(async () => options.liveUser ?? null),
    refreshTokens: jest.fn(async () => ({ ...TOKENS, refreshToken: 'next' })),
  };
  const service = new DemoService(
    prisma as never,
    usersService as never,
    seeder as never,
    authService as never,
    config as never,
  );
  return { service, prisma, tx, usersService, seeder, authService };
}

describe('DemoService', () => {
  it('creates an isolated demo user and its data in one transaction, then signs it in', async () => {
    const { service, prisma, tx, usersService, seeder, authService } =
      makeService();
    const before = Date.now();

    const result = await service.start();

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      SEED_TRANSACTION_OPTIONS,
    );
    const [input, client] = usersService.createUser.mock
      .calls[0] as unknown as [
      { email: string; isDemo: boolean; expiresAt: Date },
      unknown,
    ];
    expect(client).toBe(tx);
    expect(input.isDemo).toBe(true);
    expect(isDemoEmail(input.email)).toBe(true);
    expect(input.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 24 * HOUR,
    );
    expect(seeder.seedUserData).toHaveBeenCalledWith(
      tx,
      'demo-user',
      expect.objectContaining({ accounts: expect.any(Array) }),
    );
    expect(authService.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'demo-user' }),
    );
    expect(result).toEqual({
      status: 'created',
      tokens: TOKENS,
      expiresAt: input.expiresAt,
    });
  });

  it('gives every visitor a different user', async () => {
    const { service, usersService } = makeService();
    await service.start();
    await service.start();
    const [first, second] = usersService.createUser.mock.calls.map(
      ([input]) => input.email,
    );
    expect(first).not.toBe(second);
  });

  it('refuses when turned off, and is off in production unless enabled', async () => {
    await expect(
      makeService({ env: { DEMO_ENABLED: 'false' } }).service.start(),
    ).rejects.toMatchObject({ response: { code: 'DEMO_DISABLED' } });

    const production = makeService({
      env: { DEMO_ENABLED: undefined, NODE_ENV: 'production' },
    });
    expect(production.service.enabled).toBe(false);
    expect(
      makeService({ env: { DEMO_ENABLED: undefined, NODE_ENV: 'development' } })
        .service.enabled,
    ).toBe(true);
  });

  it('refuses with DEMO_BUSY at the active-demo cap, without creating anything', async () => {
    const { service, usersService } = makeService({
      env: { DEMO_MAX_ACTIVE: 2 },
      active: 2,
    });

    const error = await service.start().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error).toMatchObject({ response: { code: 'DEMO_BUSY' } });
    expect(usersService.createUser).not.toHaveBeenCalled();
  });

  it('carries on with the visitor’s unexpired demo instead of making another', async () => {
    const expiresAt = new Date(Date.now() + HOUR);
    const { service, usersService, authService } = makeService({
      liveUser: { id: 'demo-user', isDemo: true, expiresAt },
    });

    const result = await service.start('their-refresh-token');

    expect(authService.refreshTokens).toHaveBeenCalledWith(
      'their-refresh-token',
    );
    expect(usersService.createUser).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'reused', expiresAt });
  });

  it('leaves a real account’s session alone', async () => {
    const { service, usersService, authService } = makeService({
      liveUser: { id: 'real', isDemo: false, expiresAt: null },
    });

    expect(await service.start('their-refresh-token')).toEqual({
      status: 'signed-in',
    });
    expect(authService.refreshTokens).not.toHaveBeenCalled();
    expect(usersService.createUser).not.toHaveBeenCalled();
  });

  it('starts a new demo when the old one has ended or its token was just rotated', async () => {
    const ended = makeService({
      liveUser: {
        id: 'old',
        isDemo: true,
        expiresAt: new Date(Date.now() - 1),
      },
    });
    expect(await ended.service.start('token')).toMatchObject({
      status: 'created',
    });
    expect(ended.authService.refreshTokens).not.toHaveBeenCalled();

    const raced = makeService({
      liveUser: {
        id: 'old',
        isDemo: true,
        expiresAt: new Date(Date.now() + HOUR),
      },
    });
    raced.authService.refreshTokens.mockRejectedValueOnce(
      new UnauthorizedException(),
    );
    expect(await raced.service.start('token')).toMatchObject({
      status: 'created',
    });
  });
});
