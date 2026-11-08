import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AppReleaseController } from './app-release.controller';
import { AppReleaseService } from './app-release.service';
import { ReleaseTokenGuard } from './release-token.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AppReleaseController],
  providers: [AppReleaseService, ReleaseTokenGuard],
})
export class AppReleaseModule {}
