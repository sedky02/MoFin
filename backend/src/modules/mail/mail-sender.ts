export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Provider-agnostic outgoing mail port. Feature modules depend on this token
 * only; MailModule picks the concrete sender from configuration, and tests
 * override it with an in-memory fake to capture what was sent.
 */
export abstract class MailSender {
  abstract send(message: MailMessage): Promise<void>;

  /**
   * Whether a message reaches anyone. False only where it would be dropped, so
   * a feature that depends on the email can say so instead of pretending.
   */
  get delivers(): boolean {
    return true;
  }
}
