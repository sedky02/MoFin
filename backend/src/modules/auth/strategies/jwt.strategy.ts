import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { WEB_AUDIENCE } from '../auth.constants';

interface JwtPayload {
  sub: string;
  email: string;
  scope?: string;
}

/**
 * Verifies first-party web access tokens. Constrained to our issuer and the
 * `mofin-web` audience, and signed with a key distinct from JWT_MCP_SECRET, so
 * an OAuth/MCP-minted token (different secret, different audience, carries a
 * `scope` claim) can never be replayed against REST endpoints (SEC-XX).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      issuer: config.getOrThrow<string>('OAUTH_ISSUER').replace(/\/$/, ''),
      audience: WEB_AUDIENCE
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (payload.scope) {
      throw new UnauthorizedException('MCP-scoped token cannot be used for web sessions');
    }
    return { id: payload.sub, email: payload.email };
  }
}
