import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The assistant can't answer now but may later: no key, provider down, slow or rate limited. 503,
 * with retryAfterSeconds when the provider said how long.
 */
export class AiUnavailableException extends HttpException {
  constructor(
    message = 'The assistant is unavailable right now.',
    readonly retryAfterSeconds?: number,
  ) {
    super(
      {
        code: 'AI_UNAVAILABLE',
        message,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * The provider rejected the request itself (4xx): a bug or misconfiguration on our side, so
 * retrying won't help. 502.
 */
export class AiProviderRejectedException extends HttpException {
  constructor() {
    super(
      {
        code: 'AI_PROVIDER_ERROR',
        message:
          'The assistant could not answer because of a problem on our side. It has been reported.',
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

export function isAiProviderFailure(
  error: unknown,
): error is AiUnavailableException | AiProviderRejectedException {
  return (
    error instanceof AiUnavailableException ||
    error instanceof AiProviderRejectedException
  );
}
