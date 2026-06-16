import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Translates Prisma known-request errors into proper HTTP responses instead of
 * leaking them as unhandled 500s (audit A5).
 *
 *  - P2002 unique-constraint violation -> 409 Conflict
 *  - P2025 record-not-found            -> 404 Not Found
 *  - everything else                   -> 400 Bad Request
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

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
      default:
        this.logger.warn(`Unhandled Prisma error ${exception.code}: ${exception.message}`);
        response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Database request could not be processed',
        });
    }
  }
}
