import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const request = { method: 'GET', originalUrl: '/api/v1/accounts' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function knownError(code: string, message = 'boom', meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: '0', meta });
}

describe('PrismaExceptionFilter', () => {
  it('maps P2002 (unique constraint) to 409, naming the conflicting field', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status, json } = makeHost();
    filter.catch(knownError('P2002', 'unique', { target: ['email'] }), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, message: 'A record with this email already exists' }));
  });

  it('maps P2025 (record not found) to 404', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status } = makeHost();
    filter.catch(knownError('P2025'), host);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('maps P2003 (foreign key violation) to 409, not 400 or an unhandled 500', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status, json } = makeHost();
    filter.catch(knownError('P2003'), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  it('maps P2024 (connection pool timeout) to 503, a retryable status, not 400', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status, json } = makeHost();
    filter.catch(knownError('P2024'), host);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });

  it('maps any other Prisma known-request code to 400 (unchanged fallback)', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status } = makeHost();
    filter.catch(knownError('P2011'), host);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('maps PrismaClientInitializationError (P1xxx connectivity failures) to 503, not 400', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status, json } = makeHost();
    const error = new Prisma.PrismaClientInitializationError("Can't reach database server", '0', 'P1001');
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });

  it('maps PrismaClientRustPanicError (engine crash) to 503', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status } = makeHost();
    const error = new Prisma.PrismaClientRustPanicError('engine panicked', '0');
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(503);
  });

  it('maps PrismaClientUnknownRequestError to 503', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status } = makeHost();
    const error = new Prisma.PrismaClientUnknownRequestError('unknown engine error', { clientVersion: '0' });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(503);
  });
});
