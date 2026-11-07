import { randomBytes } from 'node:crypto';
import { SecretBox, SecretBoxError } from './secret-box';

const keyOf = () => randomBytes(32).toString('base64');

describe('SecretBox', () => {
  const box = new SecretBox(keyOf());

  it('opens what it sealed', () => {
    const sealed = box.seal('sk-live-123', 'u1:openai');
    expect(box.open(sealed, 'u1:openai')).toBe('sk-live-123');
  });

  it('never stores the plaintext and seals the same text differently each time', () => {
    const a = box.seal('sk-live-123', 'u1:openai');
    const b = box.seal('sk-live-123', 'u1:openai');
    expect(a).not.toContain('sk-live-123');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
  });

  it('refuses a ciphertext moved to another user or provider', () => {
    const sealed = box.seal('sk-live-123', 'u1:openai');
    expect(() => box.open(sealed, 'u2:openai')).toThrow(SecretBoxError);
    expect(() => box.open(sealed, 'u1:groq')).toThrow(SecretBoxError);
  });

  it('refuses a tampered ciphertext, a different key and an unknown format', () => {
    const sealed = box.seal('sk-live-123', 'u1:openai');
    const [v, iv, tag, body] = sealed.split('.');
    const flipped = `${v}.${iv}.${tag}.${body.slice(0, -2)}${body.endsWith('A') ? 'B' : 'A'}A`;
    expect(() => box.open(flipped, 'u1:openai')).toThrow(SecretBoxError);
    expect(() => new SecretBox(keyOf()).open(sealed, 'u1:openai')).toThrow(
      SecretBoxError,
    );
    expect(() => box.open('v9.a.b.c', 'u1:openai')).toThrow(SecretBoxError);
    expect(() => box.open('garbage', 'u1:openai')).toThrow(SecretBoxError);
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow(
      SecretBoxError,
    );
  });

  it('does not put the error message of a failed open in terms of the secret', () => {
    try {
      box.open('v1.AAAA.BBBB.CCCC', 'ctx');
    } catch (error) {
      expect((error as Error).message).not.toContain('CCCC');
    }
  });
});
