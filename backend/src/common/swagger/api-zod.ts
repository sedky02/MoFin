import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Bridges the project's Zod schemas into Swagger so request bodies and query
 * params are documented from the same single source of truth used for runtime
 * validation (see ZodValidationPipe). `$refStrategy: 'none'` inlines everything
 * so the schema embeds cleanly into the OpenAPI document.
 */
// Loosened signature: zodToJsonSchema's generic return type otherwise triggers
// "excessively deep" (TS2589) when fed our larger schemas.
const toJsonSchema = zodToJsonSchema as unknown as (
  schema: ZodSchema,
  options?: unknown,
) => Record<string, unknown>;

function toOpenApi(schema: ZodSchema): SchemaObject {
  const json = toJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' });
  delete json.$schema;
  return json as SchemaObject;
}

export function ApiZodBody(schema: ZodSchema): MethodDecorator {
  return applyDecorators(ApiBody({ schema: toOpenApi(schema) }));
}

export function ApiZodQuery(schema: ZodSchema): MethodDecorator {
  const json = toOpenApi(schema) as SchemaObject & {
    properties?: Record<string, SchemaObject>;
    required?: string[];
  };
  const properties = json.properties ?? {};
  const required = json.required ?? [];

  const decorators = Object.entries(properties).map(([name, prop]) =>
    ApiQuery({ name, required: required.includes(name), schema: prop }),
  );

  return applyDecorators(...decorators);
}
