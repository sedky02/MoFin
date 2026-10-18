import { Logger } from '@nestjs/common';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createMailSender } from './mail.module';
import { FileCaptureMailSender, LogMailSender, SmtpMailSender } from './mail-senders';

function configOf(values: Record<string, string | undefined>) {
  return { get: (key: string, fallback?: unknown) => values[key] ?? fallback } as never;
}

describe('createMailSender', () => {
  it('uses SMTP when SMTP_HOST is set', () => {
    expect(createMailSender(configOf({ SMTP_HOST: 'smtp.example.com' }))).toBeInstanceOf(SmtpMailSender);
  });

  it('uses the file capture sender when MAIL_CAPTURE_DIR is set outside production', () => {
    expect(createMailSender(configOf({ MAIL_CAPTURE_DIR: '/tmp/x' }))).toBeInstanceOf(FileCaptureMailSender);
  });

  it('never uses the file capture sender in production', () => {
    const sender = createMailSender(configOf({ MAIL_CAPTURE_DIR: '/tmp/x', NODE_ENV: 'production' }));
    expect(sender).toBeInstanceOf(LogMailSender);
  });

  it('falls back to the log sender without SMTP', () => {
    expect(createMailSender(configOf({}))).toBeInstanceOf(LogMailSender);
  });
});

describe('LogMailSender', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs the body outside production', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new LogMailSender(true).send({ to: 'a@b.com', subject: 'Hi', text: 'secret-link' });
    expect(log.mock.calls[0][0]).toContain('secret-link');
  });

  it('never logs the body in production', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await new LogMailSender(false).send({ to: 'a@b.com', subject: 'Hi', text: 'secret-link' });
    const logged = [...log.mock.calls, ...warn.mock.calls].map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('secret-link');
    expect(logged).not.toContain('a@b.com');
  });
});

describe('FileCaptureMailSender', () => {
  it('writes each message as a JSON file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mofin-mail-'));
    try {
      await new FileCaptureMailSender(dir).send({ to: 'a@b.com', subject: 'Reset', text: 'link' });
      const files = await readdir(dir);
      expect(files).toHaveLength(1);
      const saved = JSON.parse(await readFile(join(dir, files[0]), 'utf8'));
      expect(saved).toEqual(expect.objectContaining({ to: 'a@b.com', subject: 'Reset', text: 'link' }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
