import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import {
  CreateApiKeyDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  createApiKeySchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from './dto/auth.dto';

// Tighter limit on credential endpoints to blunt brute-force / abuse (audit B5).
@ApiTags('auth')
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiZodBody(registerSchema)
  register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiZodBody(loginSchema)
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiZodBody(refreshTokenSchema)
  refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('google')
  googleOAuthStub() {
    return this.authService.googleOAuthStub();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Post('api-keys')
  @ApiZodBody(createApiKeySchema)
  createApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createApiKeySchema)) dto: CreateApiKeyDto,
  ) {
    return this.authService.createApiKey(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
