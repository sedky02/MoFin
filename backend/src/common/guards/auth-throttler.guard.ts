import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Keys the tight per-route limit on login/register/refresh by the submitted
 * email plus IP, not IP alone. IP alone is what the default tracker uses, but
 * every request from every user in this app arrives via the same BFF hop —
 * keying by IP+email is what actually stops credential stuffing (many
 * passwords against one email) and distributed attempts against many emails
 * from behind the same NAT/proxy from drowning each other out (SEC-XX).
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const email = typeof (req.body as { email?: unknown })?.email === 'string' ? (req.body as { email: string }).email.trim().toLowerCase() : '';
    return `${req.ip}:${email}`;
  }
}
