import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

/**
 * Validates and transforms an incoming value against a Zod schema.
 *
 * Unlike the previous class-validator setup, Zod validates nested objects by
 * default, so there is no way to silently skip inner-field rules (see audit A1).
 * On success the *parsed* (and coerced) value is returned, so query strings such
 * as `?year=2026` arrive at the service as real numbers.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      throw error;
    }
  }
}
