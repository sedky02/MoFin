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

/** The one message for every rejected token, so the response leaks no detail. */
export const INVALID_ID_TOKEN_MESSAGE = 'Invalid identity token';

/** What a verified ID token says about the person who signed in. */
export interface VerifiedIdToken {
  /** The provider's stable account id (`sub`). */
  subject: string;
  /** Lowercased and trimmed; the provider vouched for it (`email_verified`). */
  email: string;
  name?: string;
}

export interface IdTokenVerifierOptions {
  /** Accepted `iss` values. */
  issuers: string[];
  /** Accepted `aud` values: our own client ids at the provider. */
  audiences: string[];
  /** Resolves the signing key from the token header (remote JWKS in production). */
  keys: JWTVerifyGetKey;
  /** Name used in log lines and the 503 message, e.g. "Google". */
  provider: string;
}

/**
 * Google ID tokens carry `iat` and `nbf` set by Google's clock. A few seconds
 * of drift on our side would otherwise reject a token the phone got a moment
 * ago as "not yet valid". 30 s is far below the token's one-hour lifetime, so
 * it does not meaningfully extend what a leaked token can do.
 */
const CLOCK_TOLERANCE_SECONDS = 30;

/** Thrown by the wrapped key resolver when the provider's keys can't be loaded. */
class SigningKeysUnavailable extends Error {}

/**
 * Verifies an OpenID Connect ID token handed to us by an untrusted client
 * (the mobile app): RS256 signature against the provider's published keys,
 * issuer, audience, expiry, and a verified email. Provider-agnostic, so Apple
 * can reuse it with its own issuer, JWKS and client ids.
 *
 * Errors:
 * - anything wrong with the token itself (signature, unknown key id, claims,
 *   malformed, wrong algorithm) -> 401 with INVALID_ID_TOKEN_MESSAGE;
 * - the provider's keys can't be fetched (network, timeout, bad response)
 *   -> 503, since it is not the caller's fault and a retry may work.
 * Neither the token nor its claims are ever logged.
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

/** jose's error code, e.g. ERR_JWKS_NO_MATCHING_KEY, if `err` is a jose error. */
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

/** Comma-separated GOOGLE_MOBILE_CLIENT_IDS as a list, empty entries dropped. */
export function parseClientIds(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Verifies Google ID tokens sent by the mobile app. The accepted audiences are
 * GOOGLE_MOBILE_CLIENT_IDS: the web client id (the Android app sets it as
 * `webClientId`, so tokens are issued for it) and later the iOS client id.
 * Without it, sign-in answers 503 like the code flow does when unconfigured.
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

/**
 * The verifier plus Google's published keys. createRemoteJWKSet fetches
 * lazily on first use, caches the set and refetches on an unknown key id
 * (at most every 30 s), so building it at startup costs no request.
 */
export const googleIdTokenProviders = [
  {
    provide: GOOGLE_ID_TOKEN_KEYS,
    useFactory: () => createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)),
  },
  GoogleIdTokenVerifier,
];
