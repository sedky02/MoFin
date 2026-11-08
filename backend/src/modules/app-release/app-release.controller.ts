import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AppReleaseService } from './app-release.service';

// Read by the landing page and by the app's update check before anyone signs in.
@Public()
@Controller('app/releases')
export class AppReleaseController {
  constructor(private readonly releases: AppReleaseService) {}

  @Get('latest')
  @Header('Cache-Control', 'public, max-age=300')
  latest() {
    return this.releases.latest();
  }
}
