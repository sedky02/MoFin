import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import type { GoogleIdentity } from './auth.service';

export const INVALID_ID_TOKEN_MESSAGE = 'Invalid identity token';

export interface VerifiedIdToken {
  subject: string;
  /** Lowercased and trimmed; the provider vouched for it (`email_verified`). */
  email: string;
  name?: string;
}

export interface IdTokenVerifierOptions {
  issuers: string[];
  audiences: string[];
  keys: JWTVerifyGetKey;
  provider: string;
}

/**
 * Google's clock sets iat/nbf; 30 s of tolerance avoids rejecting a fresh token for drift, and is
 * far below the token's hour of life.
 */
const CLOCK_TOLERANCE_SECONDS = 30;

class SigningKeysUnavailable extends Error {}

/**
 * Verifies an OIDC ID token from an untrusted client (RS256 signature, issuer, audience, expiry,
 * verified email). Token problems are a 401; provider key-fetch failures are a 503.
 */
export class IdTokenVerifier {
  private readonly logger: Logger;
  private readonly keys: JWTVerifyGetKey;

  constructor(private readonly options: IdTokenVerifierOptions) {
    this.logger = new Logger(`${options.provider}IdTokenVerifier`);
    // Tag failures that happen while loading keys, so they can be told apart
    // from a token whose key id simply isn't published (a forgery: 401).
    const resolve = options.keys;
    this.keys = async (header, token) => {
      try {
        return await resolve(header, token);
      } catch (err) {
        const code = joseCode(err);
        if (
          code === joseErrors.JWKSNoMatchingKey.code ||
          code === joseErrors.JWKSMultipleMatchingKeys.code
        )
          throw err;
        throw new SigningKeysUnavailable(errorName(err));
      }
    };
  }

  async verify(idToken: string): Promise<VerifiedIdToken> {
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(idToken, this.keys, {
        algorithms: ['RS256'],
        issuer: this.options.issuers,
        audience: this.options.audiences,
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      }));
    } catch (err) {
      if (err instanceof SigningKeysUnavailable) {
        this.logger.warn(`Could not load signing keys (${err.message})`);
        throw new ServiceUnavailableException(
          `${this.options.provider} sign-in is temporarily unavailable`,
        );
      }
      this.logger.debug(`Rejected an ID token (${errorName(err)})`);
      throw new UnauthorizedException(INVALID_ID_TOKEN_MESSAGE);
    }

    const { sub, email, email_verified: emailVerified, name } = payload;
    if (
      typeof sub !== 'string' ||
      !sub ||
      typeof email !== 'string' ||
      !email.trim() ||
      emailVerified !== true
    ) {
      this.logger.debug('Rejected an ID token (missing or unverified email)');
      throw new UnauthorizedException(INVALID_ID_TOKEN_MESSAGE);
    }

    return {
      subject: sub,
      email: email.trim().toLowerCase(),
      name: typeof name === 'string' && name ? name : undefined,
    };
  }
}

function joseCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('ERR_J')
    ? code
    : undefined;
}

/** jose's error code (e.g. ERR_JWT_EXPIRED) or the error class name; never the message. */
function errorName(err: unknown): string {
  return joseCode(err) ?? (err instanceof Error ? err.name : 'unknown error');
}

// --- Google ---

export const GOOGLE_ID_TOKEN_ISSUERS = [
  'accounts.google.com',
  'https://accounts.google.com',
];
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** DI token for Google's signing keys; tests swap in a local JWKS. */
export const GOOGLE_ID_TOKEN_KEYS = Symbol('GOOGLE_ID_TOKEN_KEYS');

export function parseClientIds(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Accepted audiences are GOOGLE_MOBILE_CLIENT_IDS (web client id, later iOS); unset, sign-in
 * answers 503.
 */
@Injectable()
export class GoogleIdTokenVerifier {
  private readonly verifier: IdTokenVerifier | null;

  constructor(
    config: ConfigService,
    @Inject(GOOGLE_ID_TOKEN_KEYS) keys: JWTVerifyGetKey,
  ) {
    const audiences = parseClientIds(
      config.get<string>('GOOGLE_MOBILE_CLIENT_IDS'),
    );
    this.verifier = audiences.length
      ? new IdTokenVerifier({
          provider: 'Google',
          issuers: GOOGLE_ID_TOKEN_ISSUERS,
          audiences,
          keys,
        })
      : null;
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (!this.verifier) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    const { subject, email, name } = await this.verifier.verify(idToken);
    return { googleId: subject, email, displayName: name };
  }
}

/** createRemoteJWKSet fetches lazily and caches, so building it at startup costs no request. */
export const googleIdTokenProviders = [
  {
    provide: GOOGLE_ID_TOKEN_KEYS,
    useFactory: () => createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)),
  },
  GoogleIdTokenVerifier,
];
