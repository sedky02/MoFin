import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OAuthMcpAuthGuard } from '../../common/guards/oauth-mcp-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DraftSource } from '@prisma/client';
import { OAuthService } from '../oauth/oauth.service';
import { McpServerFactory } from './mcp-server.factory';

/**
 * Stateless Streamable HTTP: a fresh server and transport per request, scoped to the authenticated
 * user. @Public() only skips the web JWT guard; MCP clients carry an OAuth token.
 */
@ApiTags('mcp')
@Public()
@UseGuards(OAuthMcpAuthGuard)
@Controller('mcp')
export class McpController {
  constructor(
    private readonly factory: McpServerFactory,
    private readonly oauth: OAuthService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'MCP Streamable HTTP endpoint',
    description:
      'Speaks the Model Context Protocol over JSON-RPC 2.0. Use an MCP client (e.g. Claude) rather than calling directly. Authenticate via OAuth 2.1 (see the .well-known discovery documents).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        jsonrpc: { type: 'string', example: '2.0' },
        id: { type: 'number', example: 1 },
        method: { type: 'string', example: 'tools/list' },
        params: { type: 'object' },
      },
    },
  })
  async handle(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Drafts made in this session say which connected app made them.
    const clientName = user.clientId
      ? await this.oauth.clientName(user.clientId)
      : null;
    const server = this.factory.create(user.id, {
      source: DraftSource.MCP,
      sourceClient: clientName,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  // Stateless transport does not use server-initiated streams or session deletion.
  @Get()
  @ApiExcludeEndpoint()
  notAllowedGet(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  @Delete()
  @ApiExcludeEndpoint()
  notAllowedDelete(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response): void {
    res.status(HttpStatus.METHOD_NOT_ALLOWED).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for MCP requests.',
      },
      id: null,
    });
  }
}
