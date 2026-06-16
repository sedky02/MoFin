import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  // Input validation is handled per-route by ZodValidationPipe; the Prisma
  // exception filter, throttler guard, and logging interceptor are registered
  // globally in AppModule.

  const config = app.get(ConfigService);
  await app.listen(config.get<number>('PORT', 3000));
}

void bootstrap();
