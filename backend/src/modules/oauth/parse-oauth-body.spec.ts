import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { parseOAuthBody } from './parse-oauth-body';

const schema = z.object({ grant_type: z.string() });

describe('parseOAuthBody', () => {
  it('returns the parsed body when it is valid', () => {
    expect(parseOAuthBody(schema, { grant_type: 'refresh_token' })).toEqual({
      grant_type: 'refresh_token',
    });
  });

  it.each([undefined, {}, { grant_type: 42 }])(
    'throws a 400 invalid_request for %p',
    (body) => {
      try {
        parseOAuthBody(schema, body);
        fail('expected a BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse();
        expect(response).toMatchObject({ error: 'invalid_request' });
      }
    },
  );
});
