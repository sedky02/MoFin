import { ArgumentsHost, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(url = '/api/v1/accounts') {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const request = { method: 'GET', originalUrl: url };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  it('passes through a 4xx HttpException unchanged, without reporting it', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();
    filter.catch(new BadRequestException('bad input'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad input' }));
  });

  it('maps a 5xx HttpException to itself and reports it', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = makeHost();
    filter.catch(new InternalServerErrorException('db pool exhausted'), host);
    expect(status).toHaveBeenCalledWith(500);
  });

  it('maps a bare, unclassified Error to a generic 500', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();
    filter.catch(new Error('unexpected'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
  });

  it('does not throw for a health-check path even on a 5xx (no Sentry client configured)', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = makeHost('/health/ready');
    expect(() => filter.catch(new Error('db down'), host)).not.toThrow();
    expect(status).toHaveBeenCalledWith(500);
  });
});
