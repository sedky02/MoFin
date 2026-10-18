import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthThrottlerGuard } from '../../common/guards/auth-throttler.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import { FORGOT_PASSWORD_MESSAGE, PasswordResetService } from './password-reset.service';
import {
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  // Tighter limit on credential endpoints to blunt brute-force / abuse (audit
  // B5), keyed on submitted email + IP (not IP alone, see AuthThrottlerGuard)
  // so it actually stops credential stuffing instead of just rate-limiting
  // "whoever is behind this BFF" as a single client.
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiZodBody(registerSchema)
  register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @ApiZodBody(loginSchema)
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('refresh')
  @ApiZodBody(refreshTokenSchema)
  refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  /**
   * Always 202 with the same body, whether or not the email has an account.
   * The work (lookup, token, email) runs after the response is sent, so the
   * timing doesn't tell the two cases apart either. Rate-limited per
   * email + IP to stop the endpoint being used to flood an inbox.
   */
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(forgotPasswordSchema)
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto) {
    this.passwordResetService.requestResetInBackground(dto.email);
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(resetPasswordSchema)
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(dto.token, dto.password);
  }

  @Post('logout')
  @ApiZodBody(logoutSchema)
  logout(@Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('google')
  @ApiZodBody(googleLoginSchema)
  google(@Body(new ZodValidationPipe(googleLoginSchema)) dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto.code, dto.redirectUri);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
