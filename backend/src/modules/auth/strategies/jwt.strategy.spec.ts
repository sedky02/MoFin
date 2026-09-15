import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtStrategy } from './jwt.strategy';

/**
 * Regression test for SEC-XX: an MCP/OAuth access token (different signing
 * secret, different audience, carries a `scope` claim) must never be usable
 * as a first-party web session token.
 */
describe('JwtStrategy MCP token isolation', () => {
  const WEB_SECRET = 'a'.repeat(32);
  const MCP_SECRET = 'b'.repeat(32);
  const ISSUER = 'http://localhost:3000';

  function configFor(secret: string) {
    return {
      getOrThrow: (key: string) => (key === 'OAUTH_ISSUER' ? ISSUER : secret)
    } as unknown as ConfigService;
  }

  it('rejects an MCP-minted token (different secret + audience) at the verifier level', () => {
    const mcpToken = jwt.sign({ sub: 'user-1', email: 'a@b.com', scope: 'mcp' }, MCP_SECRET, {
      issuer: ISSUER,
      audience: `${ISSUER}/api/v1/mcp`,
      expiresIn: '15m'
    });

    expect(() =>
      jwt.verify(mcpToken, WEB_SECRET, { issuer: ISSUER, audience: 'mofin-web' })
    ).toThrow();
  });

  it('validate() rejects a payload carrying an MCP scope even if it somehow verifies', () => {
    const strategy = new JwtStrategy(configFor(WEB_SECRET));
    expect(() => strategy.validate({ sub: 'user-1', email: 'a@b.com', scope: 'mcp' })).toThrow(
      UnauthorizedException
    );
  });

  it('validate() accepts a scopeless first-party payload', () => {
    const strategy = new JwtStrategy(configFor(WEB_SECRET));
    expect(strategy.validate({ sub: 'user-1', email: 'a@b.com' })).toEqual({
      id: 'user-1',
      email: 'a@b.com'
    });
  });
});
