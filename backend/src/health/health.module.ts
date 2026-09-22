import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// PrismaService comes from the @Global() PrismaModule — no import needed here.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
