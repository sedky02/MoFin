import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { customLogLevel, customProps, genReqId } from './pino-options';

/**
 * pino-http logs every response, failures included (the old interceptor only logged successes).
 * x-request-id is reused from the BFF to trace a request across both logs.
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        genReqId,
        customProps,
        customLogLevel: (_req, res, err) => customLogLevel(res, err),
        // The BFF secret header is already stripped; redacted here too in case that changes.
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-mofin-bff-secret"]',
          // Bodies are not logged today; this keeps a stored AI key out if that changes.
          'req.body.apiKey',
        ],
      },
    }),
  ],
})
export class LoggerModule {}
