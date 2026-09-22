import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { initSentry } from './common/sentry';

// Sentry.init must run before anything that could throw, so it's the very
// first thing in bootstrap. process.env directly (not ConfigService) because
// no DI container exists yet at this point.
initSentry(process.env.SENTRY_DSN);

async function bootstrap() {
  // bufferLogs queues Nest's own startup logs until app.useLogger(...) below
  // swaps in the pino-backed logger, so nothing is lost/duplicated.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // The BFF (Next.js) is the only thing that ever calls this backend directly,
  // so there is exactly one hop between us and the real client. Trusting it
  // lets Express (and ThrottlerGuard's default req.ip tracker) read the real
  // client IP from X-Forwarded-For instead of seeing the BFF's IP for every
  // request from every user (SEC-XX).
  app.set('trust proxy', 1);
  // OAuth discovery documents (RFC 8414 / RFC 9728) must live at the origin root,
  // so they are excluded from the `api/v1` prefix. The authorize/token/register
  // endpoints stay under the prefix — claude.ai reads their URLs from the metadata.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: '.well-known/oauth-protected-resource', method: RequestMethod.GET },
      { path: '.well-known/oauth-protected-resource/(.*)', method: RequestMethod.GET },
      { path: '.well-known/oauth-authorization-server', method: RequestMethod.GET },
      // Infra liveness/readiness probes expect an unversioned, well-known path.
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/(.*)', method: RequestMethod.GET },
    ],
  });

  // Input validation is handled per-route by ZodValidationPipe; the Prisma
  // exception filter, throttler guard, and structured (pino) request logging
  // are registered globally in AppModule.

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MoFin API')
    .setDescription('AI-native personal finance backend')
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const config = app.get(ConfigService);
  await app.listen(config.get<number>('PORT', 3000));
}

void bootstrap();
