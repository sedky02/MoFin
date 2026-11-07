// Built from result events: interim results replace each other until a final closes the segment;
// finals are kept in order and the latest interim follows them.

export interface Transcript {
  finals: string[];
  interim: string;
}

export const EMPTY_TRANSCRIPT: Transcript = { finals: [], interim: '' };

export function addResult(state: Transcript, transcript: string, isFinal: boolean): Transcript {
  const text = transcript.trim();
  if (!isFinal) return { ...state, interim: text };
  return { finals: text ? [...state.finals, text] : state.finals, interim: '' };
}

export function finalText(state: Transcript): string {
  return state.finals.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Usually the finals; if the recognizer stopped before closing the last segment (some engines end
 * on silence without a final), the interim is kept too rather than losing the user's last words.
 */
export function textToSend(state: Transcript): string {
  return [finalText(state), state.interim].filter(Boolean).join(' ').trim();
}

/** A new engine session starts its interim afresh, so the unfinished words are kept as heard. */
export function commitInterim(state: Transcript): Transcript {
  return state.interim ? { finals: [...state.finals, state.interim], interim: '' } : state;
}
