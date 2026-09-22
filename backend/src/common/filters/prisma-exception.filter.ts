import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

type CaughtPrismaError =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientInitializationError
  | Prisma.PrismaClientRustPanicError
  | Prisma.PrismaClientUnknownRequestError;

/**
 * Translates Prisma errors into proper HTTP responses instead of leaking them
 * as unhandled 500s, or — the bug this filter used to have — flattening every
 * unrecognized error into a 400 (audit A5/DATA-XX).
 *
 *  - P2002 unique-constraint violation              -> 409 Conflict
 *  - P2025 record-not-found                         -> 404 Not Found
 *  - P2003 foreign-key violation                     -> 409 Conflict (references a row
 *                                                        that doesn't/no longer exists —
 *                                                        plausible under a benign race,
 *                                                        not necessarily a bug)
 *  - P2024 connection-pool timeout                   -> 503 Service Unavailable
 *  - PrismaClientInitializationError (P1xxx)          -> 503 Service Unavailable
 *  - PrismaClientRustPanicError/UnknownRequestError   -> 503 Service Unavailable
 *  - any other P2xxx                                 -> 400 Bad Request
 *
 * The 503 vs 400 distinction is not cosmetic: the frontend's retry policy
 * (query-client.ts) never retries a 4xx, so mislabeling a transient DB
 * connectivity blip or pool exhaustion as 400 turns it into a
 * permanent-looking failure the user cannot retry past. All non-4xx branches
 * log at `error` (not `warn`) with the request context, so an outage is
 * actually visible/alertable instead of sitting in a warn log no one watches.
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: CaughtPrismaError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const context = `${request.method} ${request.originalUrl ?? request.url}`;

    if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
      // Connectivity failure, engine crash, or a genuinely unclassified
      // error — none of these are caused by the request's shape, so they're
      // operational/transient, not a client error.
      this.logger.error(`Prisma ${exception.constructor.name} during ${context}: ${exception.message}`, exception.stack);
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database is temporarily unavailable, please try again',
      });
      return;
    }

    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ');
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: target ? `A record with this ${target} already exists` : 'Resource already exists',
        });
        return;
      }
      case 'P2025':
        response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Requested record was not found',
        });
        return;
      case 'P2003':
        this.logger.error(`Prisma P2003 (foreign key violation) during ${context}: ${exception.message}`, exception.stack);
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'This action references a record that no longer exists',
        });
        return;
      case 'P2024':
        this.logger.error(`Prisma P2024 (connection pool timeout) during ${context}: ${exception.message}`, exception.stack);
        response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Database is temporarily unavailable, please try again',
        });
        return;
      default:
        this.logger.error(`Unhandled Prisma error ${exception.code} during ${context}: ${exception.message}`, exception.stack);
        response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Database request could not be processed',
        });
    }
  }
}
