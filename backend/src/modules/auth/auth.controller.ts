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
  EmailVerificationThrottlerGuard,
  FORGOT_PASSWORD_IP_THROTTLE,
  ForgotPasswordThrottlerGuard,
  GoogleIdTokenThrottlerGuard,
} from '../../common/guards/auth-throttler.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RefreshThrottlerGuard } from '../../common/guards/refresh-throttler.guard';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
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
  VerifyEmailDto,
  changePasswordSchema,
  forgotPasswordSchema,
  googleIdTokenSchema,
  googleLoginSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly googleIdTokenVerifier: GoogleIdTokenVerifier,
  ) {}

  // Credential routes are keyed on email + IP (see AuthThrottlerGuard) so credential stuffing is
  // actually limited. No @Throttle here: the global guard would apply the same limit per IP.
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
   * Always 202 with the same body, run after the response, so neither content nor timing reveals
   * whether the email exists. Limited per email + IP and per IP.
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

  /** Emails the caller a link proving their address. Limited per user: it sends mail. */
  @UseGuards(EmailVerificationThrottlerGuard)
  @ApiBearerAuth('jwt')
  @DemoBlocked()
  @Post('email/verification')
  @HttpCode(HttpStatus.ACCEPTED)
  sendEmailVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.emailVerificationService.sendLink(user.id);
  }

  // Limited per presented token (see authTracker), not per IP.
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(verifyEmailSchema)
  verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailDto,
  ) {
    return this.emailVerificationService.verify(dto.token);
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
   * The ID token is verified (signature, issuer, audience, expiry, verified email) before anyone is
   * signed in. Limited per IP only (see GoogleIdTokenThrottlerGuard).
   */
  @Public()
  @UseGuards(GoogleIdTokenThrottlerGuard)
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
