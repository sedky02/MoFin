import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { McpApiKeyGuard } from '../../common/guards/mcp-api-key.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { McpToolRequestDto, mcpToolRequestSchema } from './dto/mcp.dto';
import { McpService } from './mcp.service';

@UseGuards(McpApiKeyGuard)
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post('tools/call')
  callTool(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(mcpToolRequestSchema)) dto: McpToolRequestDto,
  ) {
    return this.mcpService.callTool(user.id, dto.tool, dto.arguments ?? {});
  }
}
