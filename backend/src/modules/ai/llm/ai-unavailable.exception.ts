import { HttpException, HttpStatus } from '@nestjs/common';

/** The assistant can't answer right now: no key, provider down, or rate limited. */
export class AiUnavailableException extends HttpException {
  constructor(message = 'The assistant is unavailable right now.') {
    super({ code: 'AI_UNAVAILABLE', message }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
