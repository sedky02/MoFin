import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route (or a whole controller) out of the global web JWT guard.
 * Every route needs a web access token unless it carries this, so a route
 * that forgets its guard is closed rather than open.
 *
 * Only skips the global guard: a route can still bring its own (MCP routes
 * use OAuthMcpAuthGuard), and an explicit `@UseGuards(JwtAuthGuard)` still
 * runs, so `@Public()` on a controller can't silently open a method that
 * asks for a web token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
