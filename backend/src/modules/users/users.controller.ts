import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
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
  DeleteAccountDto,
  UpdateProfileDto,
  deleteAccountSchema,
  updateProfileSchema,
} from './dto/users.dto';
import { UsersService } from './users.service';

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

  /**
   * Deletes the caller's account and all of its data. Needs the current
   * password (or the typed email for a Google-only account), and is limited
   * per user like a password change, so a stolen session can't use it to
   * guess the password.
   */
  @UseGuards(DeleteAccountThrottlerGuard)
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(deleteAccountSchema)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(deleteAccountSchema)) dto: DeleteAccountDto,
  ) {
    return this.usersService.deleteAccount(user.id, dto);
  }
}
