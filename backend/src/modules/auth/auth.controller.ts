import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { DemoBlocked } from '../../common/decorators/demo.decorator';
import {
  AuthThrottlerGuard,
  ChangePasswordThrottlerGuard,
  FORGOT_PASSWORD_IP_THROTTLE,
  ForgotPasswordThrottlerGuard,
} from '../../common/guards/auth-throttler.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RefreshThrottlerGuard } from '../../common/guards/refresh-throttler.guard';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import {
  FORGOT_PASSWORD_MESSAGE,
  PasswordResetService,
} from './password-reset.service';
import { GoogleIdTokenVerifier } from './id-token-verifier.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  GoogleIdTokenDto,
  GoogleLoginDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  changePasswordSchema,
  forgotPasswordSchema,
  googleIdTokenSchema,
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
    private readonly googleIdTokenVerifier: GoogleIdTokenVerifier,
  ) {}

  // Tighter limit on credential endpoints to blunt brute-force / abuse (audit
  // B5), keyed on submitted email + IP (not IP alone, see AuthThrottlerGuard)
  // so it actually stops credential stuffing instead of just rate-limiting
  // "whoever is behind this BFF" as a single client. No @Throttle here: the
  // global guard would read it too and apply the same limit per IP.
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('register')
  @ApiZodBody(registerSchema)
  register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('login')
  @ApiZodBody(loginSchema)
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Limited per presented token rather than per IP (see RefreshThrottlerGuard),
  // so tabs and users sharing an IP don't trip each other into a 429.
  @Public()
  @UseGuards(RefreshThrottlerGuard)
  @Post('refresh')
  @ApiZodBody(refreshTokenSchema)
  refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenDto,
  ) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  /**
   * Always 202 with the same body, whether or not the email has an account.
   * The work (lookup, token, email) runs after the response is sent, so the
   * timing doesn't tell the two cases apart either. Rate-limited per
   * email + IP to stop the endpoint being used to flood an inbox, and per IP
   * (the global guard reads this @Throttle) so one client can't mail many
   * addresses.
   */
  @Public()
  @UseGuards(ForgotPasswordThrottlerGuard)
  @Throttle({ default: FORGOT_PASSWORD_IP_THROTTLE })
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(forgotPasswordSchema)
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ) {
    this.passwordResetService.requestResetInBackground(dto.email);
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  // Limited per presented reset token (see authTracker), not per IP.
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(resetPasswordSchema)
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    return this.passwordResetService.resetPassword(dto.token, dto.password);
  }

  // Limited per user (see ChangePasswordThrottlerGuard) so a signed-in
  // session can't be used to brute-force the current password.
  @UseGuards(ChangePasswordThrottlerGuard)
  @ApiBearerAuth('jwt')
  @DemoBlocked()
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(changePasswordSchema)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  /** Signs out every web session of the caller, this one included. */
  @ApiBearerAuth('jwt')
  @DemoBlocked()
  @Post('sessions/revoke-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeAllSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeAllSessions(user.id);
  }

  @Public()
  @Post('logout')
  @ApiZodBody(logoutSchema)
  logout(@Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Public()
  @Post('google')
  @ApiZodBody(googleLoginSchema)
  google(@Body(new ZodValidationPipe(googleLoginSchema)) dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto.code, dto.redirectUri);
  }

  /**
   * Native Google sign-in from the mobile app: the body is the ID token the
   * device got from Google, so it is verified here (signature against
   * Google's keys, issuer, audience, expiry, verified email) before anyone is
   * signed in. Same response as login. Limited per IP by AuthThrottlerGuard
   * (the body has no email), so forged tokens can't be tried in bulk.
   */
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('google/id-token')
  @ApiZodBody(googleIdTokenSchema)
  async googleIdToken(
    @Body(new ZodValidationPipe(googleIdTokenSchema)) dto: GoogleIdTokenDto,
  ) {
    const identity = await this.googleIdTokenVerifier.verify(dto.idToken);
    return this.authService.signInWithGoogle(identity);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
