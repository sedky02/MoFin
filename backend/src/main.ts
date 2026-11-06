import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { trustedClientIpMiddleware } from './common/middleware/trusted-client-ip.middleware';
import { initSentry } from './common/sentry';

// Sentry must init before anything that can throw; process.env because there is no DI container
// yet.
initSentry(process.env.SENTRY_DSN);

async function bootstrap() {
  // bufferLogs holds startup logs until the pino logger is installed below.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService);
  // The BFF is the only direct caller; behind Vercel it is the trusted hop, so
  // trustedClientIpMiddleware swaps in the client IP it vouches for as req.ip (B-103).
  app.set('trust proxy', 1);
  app.use(trustedClientIpMiddleware(config.get<string>('BFF_SHARED_SECRET')));
  // OAuth discovery documents (RFC 8414/9728) must live at the origin root, so they skip the
  // `api/v1` prefix; authorize/token/register stay under it.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      {
        path: '.well-known/oauth-protected-resource',
        method: RequestMethod.GET,
      },
      {
        path: '.well-known/oauth-protected-resource/(.*)',
        method: RequestMethod.GET,
      },
      {
        path: '.well-known/oauth-authorization-server',
        method: RequestMethod.GET,
      },
      // Infra liveness/readiness probes expect an unversioned, well-known path.
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/(.*)', method: RequestMethod.GET },
    ],
  });

  // Outside production, localhost browser clients (the Expo web preview) may call the API directly;
  // production has no CORS.
  if (config.get<string>('NODE_ENV') !== 'production') {
    app.enableCors({
      origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
    });
  }

  // The API reference lists every route, so production doesn't serve it.
  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MoFin API')
      .setDescription('AI-native personal finance backend')
      .setVersion('0.1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'jwt',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(config.get<number>('PORT', 3000));
}

void bootstrap();
