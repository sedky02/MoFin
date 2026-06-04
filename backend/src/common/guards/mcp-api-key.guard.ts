import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class McpApiKeyGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.header('x-api-key') ?? request.header('authorization')?.replace(/^Bearer\s+/i, '');

    if (!apiKey) {
      throw new UnauthorizedException('Missing MCP API key');
    }

    request.user = await this.authService.validateApiKey(apiKey);
    return true;
  }
}
