import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Sentry } from '../sentry';

/**
 * Catch-all behind PrismaExceptionFilter: unhandled errors are logged and sent to Sentry instead of
 * staying an unmonitored 500. Registered before it, because Nest checks filters in reverse order.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('UnhandledException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const context = `${request.method} ${request.originalUrl ?? request.url}`;
    // Readiness probes flap during deploys; that's noise, not an incident.
    const isHealthCheck = (request.originalUrl ?? request.url ?? '').startsWith(
      '/health',
    );

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(
          `${exception.message} during ${context}`,
          exception.stack,
        );
        if (!isHealthCheck) Sentry.captureException(exception);
      }
      // An exception that knows when to retry (a provider 429) says so in the standard header too.
      const retryAfter = (exception as { retryAfterSeconds?: unknown })
        .retryAfterSeconds;
      if (typeof retryAfter === 'number' && retryAfter > 0) {
        response.setHeader('Retry-After', String(retryAfter));
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    const error =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(
      `Unhandled exception during ${context}: ${error.message}`,
      error.stack,
    );
    if (!isHealthCheck) Sentry.captureException(error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
