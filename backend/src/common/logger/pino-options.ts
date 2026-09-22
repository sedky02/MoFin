import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Pulled out of logger.module.ts so the pure request-shaping logic is
// unit-testable without spinning up nestjs-pino/a Nest app.

export function genReqId(req: IncomingMessage): string {
  const header = req.headers['x-request-id'];
  return (Array.isArray(header) ? header[0] : header) ?? randomUUID();
}

export function customProps(req: IncomingMessage): Record<string, unknown> {
  const user = (req as IncomingMessage & { user?: { id?: string } }).user;
  return user?.id ? { userId: user.id } : {};
}

export function customLogLevel(res: ServerResponse, err: Error | undefined): 'error' | 'warn' | 'info' {
  if (err || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'info';
}
