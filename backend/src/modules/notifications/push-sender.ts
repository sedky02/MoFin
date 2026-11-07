export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** The app opens this in-app path when the notification is tapped. */
  data?: { url: string };
}

/** Feature code depends on this token only; NotificationsModule picks the sender and tests swap in a fake. */
export abstract class PushSender {
  /** Returns the tokens the push service says no longer exist, so the caller can forget them. */
  abstract send(messages: PushMessage[]): Promise<string[]>;
}
