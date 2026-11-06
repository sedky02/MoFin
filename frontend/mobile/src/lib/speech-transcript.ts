// What has been heard so far, built from the recognizer's result events. Recognizers report speech
// in segments: interim results for the segment being spoken (each replacing the last), then one
// final result that closes it. Finals are kept in order; the latest interim is shown after them.

export interface Transcript {
  /** Closed segments, in the order they were spoken. */
  finals: string[];
  /** The segment still being spoken, as last heard. */
  interim: string;
}

export const EMPTY_TRANSCRIPT: Transcript = { finals: [], interim: '' };

/** One result event: the best transcript of the current segment, and whether it is final. */
export function addResult(state: Transcript, transcript: string, isFinal: boolean): Transcript {
  const text = transcript.trim();
  if (!isFinal) return { ...state, interim: text };
  return { finals: text ? [...state.finals, text] : state.finals, interim: '' };
}

/** The settled text: every final segment, joined with single spaces. */
export function finalText(state: Transcript): string {
  return state.finals.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * What to send when listening ends. Usually the finals; if the recognizer stopped before closing
 * the last segment (some engines end on silence without a final), the interim is kept too rather
 * than losing the user's last words.
 */
export function textToSend(state: Transcript): string {
  return [finalText(state), state.interim].filter(Boolean).join(' ').trim();
}
