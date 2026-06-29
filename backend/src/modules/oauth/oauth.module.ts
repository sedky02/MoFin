import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { WellKnownController } from './well-known.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [OAuthController, WellKnownController],
  providers: [OAuthService],
})
export class OAuthModule {}
