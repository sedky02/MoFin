import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWK,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import {
  GoogleIdTokenVerifier,
  IdTokenVerifier,
  INVALID_ID_TOKEN_MESSAGE,
  parseClientIds,
} from './id-token-verifier.service';

const AUDIENCE = 'web-client.apps.googleusercontent.com';
const ISSUER = 'https://accounts.google.com';

describe('IdTokenVerifier', () => {
  let signingKey: CryptoKey;
  let otherKey: CryptoKey;
  let keys: JWTVerifyGetKey;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    signingKey = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    const jwk: JWK = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'key-1',
      alg: 'RS256',
      use: 'sig',
    };
    keys = createLocalJWKSet({ keys: [jwk] });
  });

  const verifier = () =>
    new IdTokenVerifier({
      provider: 'Google',
      issuers: ['accounts.google.com', ISSUER],
      audiences: ['ios-client', AUDIENCE],
      keys,
    });

  /** A Google-like ID token; `claims` override the defaults (undefined drops one). */
  function sign(
    claims: JWTPayload = {},
    opts: { key?: CryptoKey; kid?: string } = {},
  ) {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      iss: ISSUER,
      aud: AUDIENCE,
      sub: 'google-sub-1',
      iat: now,
      exp: now + 3600,
      email: 'Jane@Example.com ',
      email_verified: true,
      name: 'Jane',
      ...claims,
    };
    for (const key of Object.keys(payload))
      if (payload[key] === undefined) delete payload[key];
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'key-1' })
      .sign(opts.key ?? signingKey);
  }

  async function expectRejected(token: string | Promise<string>) {
    const err: unknown = await verifier()
      .verify(await token)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    // One generic message whatever the reason, so nothing leaks.
    expect((err as UnauthorizedException).message).toBe(
      INVALID_ID_TOKEN_MESSAGE,
    );
  }

  it('accepts a valid token and returns the subject and normalised email', async () => {
    await expect(verifier().verify(await sign())).resolves.toEqual({
      subject: 'google-sub-1',
      email: 'jane@example.com',
      name: 'Jane',
    });
  });

  it('accepts the issuer without the scheme too', async () => {
    await expect(
      verifier().verify(await sign({ iss: 'accounts.google.com' })),
    ).resolves.toMatchObject({ subject: 'google-sub-1' });
  });

  it('rejects a token issued for another client (aud)', async () => {
    await expectRejected(sign({ aud: 'someone-elses-client' }));
  });

  it('rejects a token from another issuer', async () => {
    await expectRejected(sign({ iss: 'https://evil.example.com' }));
  });

  it('rejects an expired token, beyond the clock tolerance', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expectRejected(sign({ iat: now - 3720, exp: now - 120 }));
  });

  it('rejects a token signed with a different key under a published key id', async () => {
    await expectRejected(sign({}, { key: otherKey }));
  });

  it('rejects a token whose key id is not published', async () => {
    await expectRejected(sign({}, { kid: 'unknown-key', key: otherKey }));
  });

  it('rejects an unverified email', async () => {
    await expectRejected(sign({ email_verified: false }));
  });

  it('rejects email_verified given as a string', async () => {
    await expectRejected(sign({ email_verified: 'true' }));
  });

  it('rejects a token without a subject', async () => {
    await expectRejected(sign({ sub: undefined }));
  });

  it('rejects a token without an email', async () => {
    await expectRejected(sign({ email: undefined }));
  });

  it('rejects an unsigned token (alg none)', async () => {
    const encode = (v: object) =>
      Buffer.from(JSON.stringify(v)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'none', kid: 'key-1' })}.${encode({
      iss: ISSUER,
      aud: AUDIENCE,
      sub: 'google-sub-1',
      email: 'jane@example.com',
      email_verified: true,
      iat: now,
      exp: now + 3600,
    })}.`;
    await expectRejected(unsigned);
  });

  it('rejects an HMAC-signed token (algorithm pinned to RS256)', async () => {
    const forged = await new SignJWT({
      email: 'jane@example.com',
      email_verified: true,
    })
      .setProtectedHeader({ alg: 'HS256', kid: 'key-1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('google-sub-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-guessable-shared-secret-value'));
    await expectRejected(forged);
  });

  it('rejects garbage', async () => {
    await expectRejected('not-a-jwt');
  });

  it('answers 503, not 401 or 500, when the signing keys cannot be loaded', async () => {
    const unreachable = new IdTokenVerifier({
      provider: 'Google',
      issuers: [ISSUER],
      audiences: [AUDIENCE],
      keys: () => Promise.reject(new TypeError('fetch failed')),
    });
    await expect(unreachable.verify(await sign())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('GoogleIdTokenVerifier', () => {
  const keys: JWTVerifyGetKey = () =>
    Promise.reject(new Error('keys must not be fetched'));

  it('answers 503 when GOOGLE_MOBILE_CLIENT_IDS is not set', async () => {
    const verifier = new GoogleIdTokenVerifier(new ConfigService({}), keys);
    await expect(verifier.verify('anything')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('answers 503 when GOOGLE_MOBILE_CLIENT_IDS holds only separators', async () => {
    const verifier = new GoogleIdTokenVerifier(
      new ConfigService({ GOOGLE_MOBILE_CLIENT_IDS: ' , ' }),
      keys,
    );
    await expect(verifier.verify('anything')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('parseClientIds', () => {
  it('splits, trims and drops empty entries', () => {
    expect(parseClientIds(' a.apps , ,b.apps,')).toEqual(['a.apps', 'b.apps']);
    expect(parseClientIds(undefined)).toEqual([]);
  });
});
