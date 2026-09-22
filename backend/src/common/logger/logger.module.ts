import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { customLogLevel, customProps, genReqId } from './pino-options';

/**
 * Structured, request-scoped logging (audit OBS-01). Replaces the old
 * LoggingInterceptor, which only logged on success (`tap`'s `next` callback
 * only) — a failed request never appeared in the logs at all. pino-http logs
 * on every response, success or error, via Node's `finish`/`close` events.
 *
 *  - `genReqId` reuses the BFF's `x-request-id` header when present (see
 *    frontend/web/app/api/backend/[...path]/route.ts) so one request can be
 *    traced across both processes' logs; falls back to a fresh uuid for
 *    direct/MCP callers that don't set it.
 *  - `customProps` adds `userId` once a guard has populated `req.user`
 *    (evaluated at log-emit time, i.e. after the route handler ran, so it's
 *    already set).
 *  - `customLogLevel` reflects response severity (5xx -> error, 4xx -> warn,
 *    else info) instead of everything being logged at the same level.
 *  - `redact` strips the auth header/cookies from the rare cases pino-http
 *    would otherwise include request headers, so a token never lands in logs.
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        genReqId,
        customProps,
        customLogLevel: (_req, res, err) => customLogLevel(res, err),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
  ],
})
export class LoggerModule {}
