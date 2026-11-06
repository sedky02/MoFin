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
 * @DemoBlocked() routes answer 403, @DemoQuota() routes 429 past the cap. POST
 * /oauth/session/handoff is public, so OAuthService.createHandoff refuses demo users itself.
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
    if (quota === 'ai-chat') {
      const cap = this.config.getOrThrow<number>('DEMO_AI_CHAT_CAP');
      const used = await this.prisma.aiChatMessage.count({
        where: { role: 'USER', chat: { userId: user.id } },
      });
      if (used >= cap) {
        throw new HttpException(
          {
            code: 'DEMO_LIMIT',
            message: `The demo allows ${cap} chat questions. Create an account to keep going.`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}
