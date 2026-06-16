import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 moved the connection URL out of schema.prisma. The CLI (migrate,
 * introspect, studio) reads it from here; the runtime PrismaClient connects via
 * the pg driver adapter configured in src/database/prisma.service.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
