import { Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';

/**
 * Work that must not delay the response (and so can't reveal anything through timing). On Vercel a
 * function is frozen once it has responded, so the task is handed to waitUntil to finish; elsewhere
 * the promise simply keeps running. Failures are logged, never surfaced.
 */
export function runAfterResponse(
  logger: Logger,
  label: string,
  task: Promise<unknown>,
): void {
  waitUntil(
    task.catch((err: unknown) => {
      logger.error(
        `${label} could not be processed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }),
  );
}
