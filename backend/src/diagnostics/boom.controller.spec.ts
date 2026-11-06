import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BoomController } from './boom.controller';

const inEnv = (nodeEnv?: string) =>
  new BoomController({ get: () => nodeEnv } as unknown as ConfigService);

describe('BoomController', () => {
  it.each([undefined, 'development', 'test'])(
    'throws an unhandled error when NODE_ENV is %s',
    (nodeEnv) => {
      const controller = inEnv(nodeEnv);
      expect(() => controller.boom()).toThrow('Boom');
      expect(() => controller.boom()).not.toThrow(NotFoundException);
    },
  );

  it('is a 404 in production, so nobody can fill the error tracker', () => {
    expect(() => inEnv('production').boom()).toThrow(NotFoundException);
  });
});
