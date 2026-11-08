import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** Constant time; hashing first makes both the same length, so a wrong guess leaks neither content nor length. */
function tokenMatches(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Lets the release script publish builds with APP_RELEASE_TOKEN as a bearer token. Without the
 * token configured the routes answer 404, as if they didn't exist.
 */
@Injectable()
export class ReleaseTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('APP_RELEASE_TOKEN');
    if (!expected) throw new NotFoundException();
    const header =
      context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!presented || !tokenMatches(presented, expected))
      throw new UnauthorizedException();
    return true;
  }
}
