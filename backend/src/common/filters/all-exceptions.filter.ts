import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Sentry } from '../sentry';

/**
 * Catch-all fallback behind PrismaExceptionFilter (audit OBS-01): anything
 * NestJS's own exception handling would otherwise turn into an unreported
 * 500 gets logged at `error` and sent to Sentry here, instead of only
 * existing as an unmonitored warn-level HTTP access log line.
 *
 * Registration order matters: Nest evaluates global filters in REVERSE
 * registration order and stops at the first `@Catch()` match, so this
 * catch-all (matches everything) must be registered BEFORE
 * PrismaExceptionFilter in app.module.ts's providers array for the
 * Prisma-specific filter to still get first refusal on Prisma errors.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('UnhandledException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const context = `${request.method} ${request.originalUrl ?? request.url}`;
    // Readiness probes flap during routine deploys/restarts; that's expected
    // operational noise, not an incident worth paging on.
    const isHealthCheck = (request.originalUrl ?? request.url ?? '').startsWith('/health');

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(`${exception.message} during ${context}`, exception.stack);
        if (!isHealthCheck) Sentry.captureException(exception);
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`Unhandled exception during ${context}: ${error.message}`, error.stack);
    if (!isHealthCheck) Sentry.captureException(error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
