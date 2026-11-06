import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { OAuthService } from './oauth.service';

/**
 * Discovery documents must be served at the origin root (see main.ts's prefix exclude): claude.ai
 * derives them from the resource origin per RFC 8414/9728.
 */
@ApiExcludeController()
@Public()
@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly oauth: OAuthService) {}

  @Get('oauth-authorization-server')
  authorizationServer() {
    return this.oauth.authorizationServerMetadata();
  }

  @Get('oauth-protected-resource')
  protectedResource() {
    return this.oauth.protectedResourceMetadata();
  }

  // claude.ai may probe the path-suffixed form, e.g.
  // /.well-known/oauth-protected-resource/api/v1/mcp — serve the same document.
  @Get('oauth-protected-resource/*')
  protectedResourceSuffixed() {
    return this.oauth.protectedResourceMetadata();
  }
}
