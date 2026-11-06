import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the global JWT guard; routes are closed by default. An explicit
 * @UseGuards(JwtAuthGuard) still runs.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
