import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { demoEmail } from '../../common/utils/demo-identity';
import { PrismaService } from '../../database/prisma.service';
import { buildDemoPlan, DEMO_DISPLAY_NAME } from '../../demo/demo-plan';
import { DemoSeeder, SEED_TRANSACTION_OPTIONS } from '../../demo/demo-seeder';
import { AuthService, demoHasEnded } from '../auth/auth.service';
import { UsersService } from '../users/users.service';

type Tokens = { accessToken: string; refreshToken: string };

export type DemoStartResult =
  | { status: 'created' | 'reused'; tokens: Tokens; expiresAt: Date }
  /** The visitor is signed in to a real account; leave that session alone. */
  | { status: 'signed-in' };

/**
 * Every visitor gets their own temporary user with the sample data, deleted by DemoCleanupCron once
 * it expires; never shared, so one visitor can't change what another sees.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly seeder: DemoSeeder,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** On unless turned off; in production only when DEMO_ENABLED=true. */
  get enabled(): boolean {
    const flag = this.config.get<string>('DEMO_ENABLED');
    if (flag) return flag === 'true';
    return this.config.get<string>('NODE_ENV') !== 'production';
  }

  async start(refreshToken?: string): Promise<DemoStartResult> {
    if (!this.enabled) {
      throw new ServiceUnavailableException({
        code: 'DEMO_DISABLED',
        message: 'The demo is not available right now.',
      });
    }

    if (refreshToken) {
      const reused = await this.reuse(refreshToken);
      if (reused) return reused;
    }

    const now = new Date();
    // A count then a create, not a lock: two visitors arriving together can
    // both get in at the limit. DemoThrottlerGuard keeps that overshoot small.
    const active = await this.prisma.user.count({
      where: { isDemo: true, expiresAt: { gt: now } },
    });
    if (active >= this.config.getOrThrow<number>('DEMO_MAX_ACTIVE')) {
      throw new ServiceUnavailableException({
        code: 'DEMO_BUSY',
        message:
          'The demo is busy right now. Please try again in a little while.',
      });
    }

    const expiresAt = new Date(
      now.getTime() +
        this.config.getOrThrow<number>('DEMO_TTL_HOURS') * 60 * 60_000,
    );
    // The user and its sample data land together or not at all.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await this.usersService.createUser(
        {
          email: demoEmail(randomUUID()),
          displayName: DEMO_DISPLAY_NAME,
          isDemo: true,
          expiresAt,
        },
        tx,
      );
      await this.seeder.seedUserData(tx, created.id, buildDemoPlan(now));
      return created;
    }, SEED_TRANSACTION_OPTIONS);

    this.logger.log(`Created a demo user (${active + 1} active)`);
    return {
      status: 'created',
      tokens: await this.authService.startSession(user),
      expiresAt,
    };
  }

  /**
   * A visitor in an unexpired demo carries on with it; a real account's session is reported, not
   * touched; anything else falls through to a new demo.
   */
  private async reuse(refreshToken: string): Promise<DemoStartResult | null> {
    const user = await this.authService.liveSessionUser(refreshToken);
    if (!user) return null;
    if (!user.isDemo) return { status: 'signed-in' };
    if (demoHasEnded(user) || !user.expiresAt) return null;
    try {
      return {
        status: 'reused',
        tokens: await this.authService.refreshTokens(refreshToken),
        expiresAt: user.expiresAt,
      };
    } catch (error) {
      // Rotated by a concurrent request in between: start a fresh demo.
      if (error instanceof UnauthorizedException) return null;
      throw error;
    }
  }
}
