import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailSender } from './mail-sender';
import {
  FileCaptureMailSender,
  LogMailSender,
  SmtpMailSender,
} from './mail-senders';

/**
 * Picks the sender: SMTP_HOST → real SMTP; MAIL_CAPTURE_DIR (non-production) → JSON files; else
 * log-only.
 */
export function createMailSender(config: ConfigService): MailSender {
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const host = config.get<string>('SMTP_HOST');
  if (host) {
    return new SmtpMailSender({
      host,
      port: Number(config.get('SMTP_PORT', 587)),
      secure: String(config.get('SMTP_SECURE', 'false')) === 'true',
      user: config.get<string>('SMTP_USER') || undefined,
      pass: config.get<string>('SMTP_PASS') || undefined,
      from: config.get<string>('MAIL_FROM', 'MoFin <no-reply@mofin.local>'),
    });
  }
  const captureDir = config.get<string>('MAIL_CAPTURE_DIR');
  if (captureDir && !isProduction) {
    return new FileCaptureMailSender(captureDir);
  }
  return new LogMailSender(!isProduction);
}

@Module({
  providers: [
    {
      provide: MailSender,
      useFactory: createMailSender,
      inject: [ConfigService],
    },
  ],
  exports: [MailSender],
})
export class MailModule {}
