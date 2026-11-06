import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { DemoThrottlerGuard } from './demo-throttler.guard';
import { DemoService } from './demo.service';
import { StartDemoDto, startDemoSchema } from './dto/demo.dto';

@ApiTags('auth')
@Controller('auth')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  /**
   * Signs the visitor in to their own temporary demo user (creating or continuing one). 409 when
   * signed in to a real account, 503 when the demo is off or full, 429 past the per-IP limit.
   */
  @Public()
  @UseGuards(DemoThrottlerGuard)
  @Post('demo')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(startDemoSchema)
  async start(@Body(new ZodValidationPipe(startDemoSchema)) dto: StartDemoDto) {
    const result = await this.demoService.start(dto.refreshToken);
    if (result.status === 'signed-in') {
      throw new ConflictException({
        code: 'SIGNED_IN',
        message: 'You are already signed in.',
      });
    }
    return {
      ...result.tokens,
      expiresAt: result.expiresAt.toISOString(),
      reused: result.status === 'reused',
    };
  }
}
