import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DemoBlocked } from '../../../common/decorators/demo.decorator';
import { AiCredentialThrottlerGuard } from '../../../common/guards/auth-throttler.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ApiZodBody } from '../../../common/swagger/api-zod';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AiProviderId, aiProviderSchema } from '../llm/provider-presets';
import { AiCredentialsService } from './ai-credentials.service';
import {
  SaveAiCredentialDto,
  UpdateAiPreferencesDto,
  saveAiCredentialSchema,
  updateAiPreferencesSchema,
} from './dto/ai-credentials.dto';

/** Write-only for keys: no route returns one, only the last four characters. */
@ApiTags('ai')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@DemoBlocked()
@Controller('ai/credentials')
export class AiCredentialsController {
  constructor(private readonly credentials: AiCredentialsService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.credentials.overview(user.id);
  }

  @Patch()
  @ApiZodBody(updateAiPreferencesSchema)
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateAiPreferencesSchema))
    dto: UpdateAiPreferencesDto,
  ) {
    return this.credentials.updatePreferences(user.id, dto);
  }

  @UseGuards(AiCredentialThrottlerGuard)
  @Put(':provider')
  @ApiZodBody(saveAiCredentialSchema)
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider', new ZodValidationPipe(aiProviderSchema))
    provider: AiProviderId,
    @Body(new ZodValidationPipe(saveAiCredentialSchema))
    dto: SaveAiCredentialDto,
  ) {
    return this.credentials.saveKey(user.id, provider, dto);
  }

  @UseGuards(AiCredentialThrottlerGuard)
  @Delete(':provider')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider', new ZodValidationPipe(aiProviderSchema))
    provider: AiProviderId,
  ) {
    return this.credentials.removeKey(user.id, provider);
  }
}
