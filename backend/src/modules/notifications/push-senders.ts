import { Logger } from '@nestjs/common';
import { PushMessage, PushSender } from './push-sender';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10_000;

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

export class ExpoPushSender extends PushSender {
  private readonly logger = new Logger(ExpoPushSender.name);

  constructor(private readonly accessToken?: string) {
    super();
  }

  async send(messages: PushMessage[]): Promise<string[]> {
    const gone: string[] = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
      try {
        gone.push(...(await this.sendBatch(batch)));
      } catch (error) {
        // Titles and bodies describe the user's finances, so only the failure is logged.
        this.logger.warn(
          `Expo push batch of ${batch.length} failed: ${(error as Error).message}`,
        );
      }
    }
    return gone;
  }

  private async sendBatch(batch: PushMessage[]): Promise<string[]> {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(this.accessToken
          ? { authorization: `Bearer ${this.accessToken}` }
          : {}),
      },
      body: JSON.stringify(
        batch.map((message) => ({ ...message, sound: 'default' })),
      ),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { data } = (await response.json()) as { data?: ExpoTicket[] };
    return (data ?? []).flatMap((ticket, index) =>
      ticket.status === 'error' &&
      ticket.details?.error === 'DeviceNotRegistered'
        ? [batch[index].to]
        : [],
    );
  }
}

/** Development and tests: records that something would have been sent, never what it says. */
export class LogPushSender extends PushSender {
  private readonly logger = new Logger(LogPushSender.name);

  send(messages: PushMessage[]): Promise<string[]> {
    this.logger.log(`Would push ${messages.length} notification(s)`);
    return Promise.resolve([]);
  }
}
