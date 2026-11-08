import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppPlatform } from '@prisma/client';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import {
  publishRelease,
  publishReleaseSchema,
  ReleaseConflictError,
  withdrawRelease,
} from './app-release.publishing';
import { AppReleaseService } from './app-release.service';
import { ReleaseTokenGuard } from './release-token.guard';

const withdrawSchema = z.object({
  platform: z.nativeEnum(AppPlatform),
  build: z.coerce.number().int().positive(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  return result.data;
}

// Public to the user JWT guard: reading is open, and writing needs the release token instead.
@Public()
@Controller('app/releases')
export class AppReleaseController {
  constructor(
    private readonly releases: AppReleaseService,
    private readonly prisma: PrismaService,
  ) {}

  // Read by the landing page and by the app's update check before anyone signs in.
  @Get('latest')
  @Header('Cache-Control', 'public, max-age=300')
  latest() {
    return this.releases.latest();
  }

  @Post()
  @UseGuards(ReleaseTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  async publish(@Body() body: unknown) {
    const input = parse(publishReleaseSchema, body);
    try {
      return await publishRelease(this.prisma, input);
    } catch (err) {
      if (err instanceof ReleaseConflictError)
        throw new ConflictException(err.message);
      throw err;
    }
  }

  @Post('withdraw')
  @UseGuards(ReleaseTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(@Body() body: unknown) {
    const { platform, build } = parse(withdrawSchema, body);
    try {
      await withdrawRelease(this.prisma, platform, build);
    } catch (err) {
      if (err instanceof ReleaseConflictError)
        throw new ConflictException(err.message);
      throw err;
    }
  }
}
