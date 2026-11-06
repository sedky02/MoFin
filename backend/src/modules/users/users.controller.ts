import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DeleteAccountThrottlerGuard } from '../../common/guards/auth-throttler.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ConfirmDeleteDto,
  UpdateProfileDto,
  confirmDeleteSchema,
  updateProfileSchema,
} from './dto/users.dto';
import { UsersService } from './users.service';
import { DemoBlocked } from '../../common/decorators/demo.decorator';

@ApiTags('users')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  @ApiZodBody(updateProfileSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  /** Needs `confirm: "DELETE"` in the body, and is limited per user. */
  @UseGuards(DeleteAccountThrottlerGuard)
  @DemoBlocked()
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(confirmDeleteSchema)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmDeleteSchema)) _dto: ConfirmDeleteDto,
  ) {
    return this.usersService.deleteAccount(user.id);
  }

  /**
   * Keeps the profile, sign-ins, sessions and connected AI apps. Needs `confirm: "DELETE"` and
   * shares the delete limit.
   */
  @UseGuards(DeleteAccountThrottlerGuard)
  @DemoBlocked()
  @Post('me/reset-data')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(confirmDeleteSchema)
  resetData(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmDeleteSchema)) _dto: ConfirmDeleteDto,
  ) {
    return this.usersService.resetData(user.id);
  }
}
