import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // OAuth discovery documents (RFC 8414 / RFC 9728) must live at the origin root,
  // so they are excluded from the `api/v1` prefix. The authorize/token/register
  // endpoints stay under the prefix — claude.ai reads their URLs from the metadata.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: '.well-known/oauth-protected-resource', method: RequestMethod.GET },
      { path: '.well-known/oauth-protected-resource/(.*)', method: RequestMethod.GET },
      { path: '.well-known/oauth-authorization-server', method: RequestMethod.GET },
    ],
  });

  // Input validation is handled per-route by ZodValidationPipe; the Prisma
  // exception filter, throttler guard, and logging interceptor are registered
  // globally in AppModule.

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
