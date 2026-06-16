import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Controller, Delete, Get, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { McpApiKeyGuard } from '../../common/guards/mcp-api-key.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { McpServerFactory } from './mcp-server.factory';

/**
 * Real MCP server over the stateless Streamable HTTP transport.
 *
 * Authentication is handled by McpApiKeyGuard (sets req.user); a fresh
 * MCP server + transport is built per request and scoped to that user. Stateless
 * means no session map and a single JSON response per call (enableJsonResponse).
 */
@UseGuards(McpApiKeyGuard)
@Controller('mcp')
export class McpController {
  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  async handle(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const server = this.factory.create(user.id);
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
  notAllowedGet(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  @Delete()
  notAllowedDelete(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response): void {
    res.status(HttpStatus.METHOD_NOT_ALLOWED).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST for MCP requests.' },
      id: null,
    });
  }
}
