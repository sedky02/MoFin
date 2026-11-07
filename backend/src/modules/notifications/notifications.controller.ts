import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DemoBlocked } from '../../common/decorators/demo.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  RegisterDeviceDto,
  UpdateNotificationPreferencesDto,
  registerDeviceSchema,
  updateNotificationPreferencesSchema,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@DemoBlocked()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(registerDeviceSchema)
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerDeviceSchema)) dto: RegisterDeviceDto,
  ) {
    await this.notifications.registerDevice(user.id, dto);
  }

  @Delete('devices/:expoToken')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(
    @CurrentUser() user: AuthenticatedUser,
    @Param('expoToken') expoToken: string,
  ) {
    await this.notifications.removeDevice(user.id, expoToken);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiZodBody(updateNotificationPreferencesSchema)
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema))
    dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(user.id, dto);
  }
}
