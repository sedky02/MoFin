import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class SecretBoxError extends Error {}

/**
 * AES-256-GCM for secrets we must be able to read back (a person's AI provider key). `context`
 * is authenticated but not stored, so a ciphertext only opens for the row it was written for.
 * Stored as `v1.iv.tag.ciphertext` (base64url); the version leaves room to rotate the key.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== KEY_BYTES) {
      throw new SecretBoxError('The encryption key must be 32 bytes');
    }
  }

  seal(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const body = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [VERSION, iv, cipher.getAuthTag(), body]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64url'),
      )
      .join('.');
  }

  open(sealed: string, context: string): string {
    const [version, iv, tag, body] = sealed.split('.');
    if (version !== VERSION || !iv || !tag || !body) {
      throw new SecretBoxError('Unknown secret format');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SecretBoxError('The secret could not be opened');
    }
  }
}
