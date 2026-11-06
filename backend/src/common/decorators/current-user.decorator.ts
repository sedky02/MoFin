import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Fails closed: without req.user, an undefined userId would make Prisma drop the filter and run the
 * query unscoped. A 401 is the only safe answer.
 */
export function currentUserFromContext(
  ctx: ExecutionContext,
): AuthenticatedUser {
  const user = ctx
    .switchToHttp()
    .getRequest<{ user?: Partial<AuthenticatedUser> | null }>().user;
  if (typeof user?.id !== 'string' || user.id.length === 0) {
    throw new UnauthorizedException();
  }
  return user as AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    currentUserFromContext(ctx),
);
