import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';

/**
 * Throws an unhandled error, to check the failure path end to end: the 500
 * answer, the error log and the Sentry report. Public so a bare curl works,
 * and therefore closed in production, where anyone could otherwise fill the
 * error tracker with it.
 */
@Public()
@Controller('boom')
export class BoomController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  boom(): never {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException();
    }
    throw new Error('Boom: a test error from GET /boom');
  }
}
