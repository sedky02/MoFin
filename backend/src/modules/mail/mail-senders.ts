import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createTransport, type Transporter } from 'nodemailer';
import { MailMessage, MailSender } from './mail-sender';

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/** Sends through any SMTP relay (Postmark, SES SMTP, Mailgun, a local Mailpit…). */
export class SmtpMailSender extends MailSender {
  private readonly transporter: Transporter;

  constructor(private readonly settings: SmtpSettings) {
    super();
    this.transporter = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.user
        ? { user: settings.user, pass: settings.pass ?? '' }
        : undefined,
      // Bounded so a stuck relay can't pile up pending sends.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.settings.from, ...message });
  }
}

/**
 * Fallback with no SMTP relay: logs the message outside production so a developer can follow a
 * link; in production only that a message was dropped, since the body carries a live credential.
 */
export class LogMailSender extends MailSender {
  private readonly logger = new Logger('MailSender');

  constructor(private readonly includeBody: boolean) {
    super();
  }

  get delivers(): boolean {
    return this.includeBody;
  }

  send(message: MailMessage): Promise<void> {
    if (this.includeBody) {
      this.logger.log(
        `Email (not sent, no SMTP configured) to ${message.to}: ${message.subject}\n${message.text}`,
      );
      return Promise.resolve();
    }
    this.logger.warn(
      `Email "${message.subject}" was not sent: SMTP is not configured`,
    );
    return Promise.resolve();
  }
}

/**
 * Development/test only (refused in production): writes each message as JSON so e2e runs can read
 * the links.
 */
export class FileCaptureMailSender extends MailSender {
  constructor(private readonly dir: string) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}.json`;
    await writeFile(
      join(this.dir, name),
      JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2),
    );
  }
}
