import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { Sentry } from '../sentry';

type CaughtPrismaError =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientInitializationError
  | Prisma.PrismaClientRustPanicError
  | Prisma.PrismaClientUnknownRequestError;

/**
 * Maps Prisma errors to HTTP: unique/foreign-key 409, not found 404, pool and engine failures 503,
 * else 400. The frontend never retries a 4xx, hence 503.
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
      // Not caused by the request's shape, so it is operational and transient, not a client error.
      this.logger.error(
        `Prisma ${exception.constructor.name} during ${context}: ${exception.message}`,
        exception.stack,
      );
      Sentry.captureException(exception);
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database is temporarily unavailable, please try again',
      });
      return;
    }

    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(
          ', ',
        );
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: target
            ? `A record with this ${target} already exists`
            : 'Resource already exists',
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
        this.logger.error(
          `Prisma P2003 (foreign key violation) during ${context}: ${exception.message}`,
          exception.stack,
        );
        Sentry.captureException(exception);
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'This action references a record that no longer exists',
        });
        return;
      case 'P2024':
        this.logger.error(
          `Prisma P2024 (connection pool timeout) during ${context}: ${exception.message}`,
          exception.stack,
        );
        Sentry.captureException(exception);
        response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Database is temporarily unavailable, please try again',
        });
        return;
      default:
        this.logger.error(
          `Unhandled Prisma error ${exception.code} during ${context}: ${exception.message}`,
          exception.stack,
        );
        Sentry.captureException(exception);
        response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Database request could not be processed',
        });
    }
  }
}
