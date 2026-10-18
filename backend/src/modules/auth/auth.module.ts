import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../database/prisma.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PrismaModule, UsersModule, MailModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, JwtStrategy],
  exports: [AuthService]
})
export class AuthModule {}
