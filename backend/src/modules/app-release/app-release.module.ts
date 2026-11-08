import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AppReleaseController } from './app-release.controller';
import { AppReleaseService } from './app-release.service';

@Module({
  imports: [PrismaModule],
  controllers: [AppReleaseController],
  providers: [AppReleaseService],
})
export class AppReleaseModule {}
