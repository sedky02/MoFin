import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Controller, Delete, Get, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiExcludeEndpoint, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { McpAuthGuard } from '../../common/guards/mcp-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { McpServerFactory } from './mcp-server.factory';

/**
 * Real MCP server over the stateless Streamable HTTP transport.
 *
 * Authentication is handled by McpAuthGuard (sets req.user); a fresh
 * MCP server + transport is built per request and scoped to that user. Stateless
 * means no session map and a single JSON response per call (enableJsonResponse).
 */
@ApiTags('mcp')
@ApiSecurity('api-key')
@UseGuards(McpAuthGuard)
@Controller('mcp')
export class McpController {
  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  @ApiOperation({
    summary: 'MCP Streamable HTTP endpoint',
    description:
      'Speaks the Model Context Protocol over JSON-RPC 2.0. Use an MCP client (e.g. MCP Inspector) rather than calling directly. Authenticate with the x-api-key header.',
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
      error: { code: -32000, message: 'Method not allowed. Use POST for MCP requests.' },
      id: null,
    });
  }
}
