import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import {
  DEMO_BLOCKED_KEY,
  DEMO_QUOTA_KEY,
  DemoQuotaName,
  demoBlocked,
} from '../decorators/demo.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';
import { isDemoEmail } from '../utils/demo-identity';

/**
 * Everything a temporary demo user may not do, in one place. Registered as an
 * APP_GUARD after GlobalJwtAuthGuard, so `req.user` is set on every signed-in
 * route; demo users are recognised by their reserved email domain, without a
 * database read. Real users and public routes pass straight through.
 *
 * - `@DemoBlocked()` routes answer 403 DEMO_BLOCKED.
 * - `@DemoQuota('ai-drafts')` routes answer 429 DEMO_LIMIT once the user has
 *   DEMO_AI_CAP drafts (counted in the database, so it survives restarts).
 *
 * One route checks for itself: POST /oauth/session/handoff is public and
 * verifies its own bearer token, so OAuthService.createHandoff refuses demo
 * users there with the same demoBlocked() error.
 *
 * Nothing else needs stubbing today: password-reset email skips password-less
 * users (and `.invalid` receives no mail), the AI parser is local, and there
 * are no uploads, webhooks, billing or SMS. New routes of those kinds should
 * carry `@DemoBlocked()`.
 */
@Injectable()
export class DemoRestrictionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user || !isDemoEmail(user.email)) return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(DEMO_BLOCKED_KEY, targets))
      throw demoBlocked();

    const quota = this.reflector.getAllAndOverride<DemoQuotaName>(
      DEMO_QUOTA_KEY,
      targets,
    );
    if (quota === 'ai-drafts') {
      const cap = this.config.getOrThrow<number>('DEMO_AI_CAP');
      const used = await this.prisma.draftTransaction.count({
        where: { userId: user.id },
      });
      if (used >= cap) {
        throw new HttpException(
          {
            code: 'DEMO_LIMIT',
            message: `The demo allows ${cap} AI drafts. Create an account to keep going.`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}
