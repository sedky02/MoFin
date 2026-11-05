import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The assistant can't answer right now, and trying again later may work: no
 * key, provider down or slow, or rate limited. 503, with `retryAfterSeconds`
 * when the provider said how long to wait (AllExceptionsFilter turns it into a
 * Retry-After header).
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
 * The provider refused the request itself (400/401/403/404...): a bug or a
 * misconfiguration on our side, so retrying won't help. 502, and logged at
 * error level by the provider with the provider's own error code.
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

/** Any failure that came from the model provider rather than from MoFin's own data. */
export function isAiProviderFailure(
  error: unknown,
): error is AiUnavailableException | AiProviderRejectedException {
  return (
    error instanceof AiUnavailableException ||
    error instanceof AiProviderRejectedException
  );
}
