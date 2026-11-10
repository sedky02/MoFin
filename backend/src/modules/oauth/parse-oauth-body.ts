import { BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

/** RFC 6749 §5.2: a malformed request is a 400 `invalid_request`, never a 5xx clients would retry. */
export function parseOAuthBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      error: 'invalid_request',
      error_description: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; '),
    });
  }
  return parsed.data;
}
