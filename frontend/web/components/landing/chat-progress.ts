/**
 * Demos are driven by scroll, not a timer: one number from 0 to 1 says how far the visitor has
 * scrolled, so scrolling faster plays faster and scrolling back rewinds.
 */

export const TYPING = 1;
export const SENT = 2;
export const THINKING = 3;
export const TOOL_CALL = 4;
export const ANSWERED = 5;
export const CARD = 6;

const MARKS = {
  typing: 0.02,
  sent: 0.24,
  thinking: 0.32,
  tool: 0.42,
  answer: 0.52,
  card: 0.84,
} as const;

const share = (q: number, from: number, to: number) => Math.min(1, Math.max(0, (q - from) / (to - from)));

export interface ChatFrame {
  stage: number;
  typed: string;
  answer: string;
}

export function chatFrame(q: number, question: string, answer: string): ChatFrame {
  const stage =
    q >= MARKS.card ? CARD
    : q >= MARKS.answer ? ANSWERED
    : q >= MARKS.tool ? TOOL_CALL
    : q >= MARKS.thinking ? THINKING
    : q >= MARKS.sent ? SENT
    : q >= MARKS.typing ? TYPING
    : 0;
  const typedChars = Math.floor(question.length * share(q, MARKS.typing, MARKS.sent));
  const answerChars = Math.ceil(answer.length * share(q, MARKS.answer, MARKS.card - 0.06));
  return {
    stage,
    typed: stage === TYPING ? question.slice(0, typedChars) : "",
    answer: stage >= ANSWERED ? answer.slice(0, answerChars) : "",
  };
}

/** For stages written as delays: the point in 0-1 where each begins, in the same proportions. */
export function marksFromDelays(delays: readonly number[]): number[] {
  const total = delays.reduce((sum, d) => sum + d, 0);
  let at = 0;
  return delays.map((d) => {
    at += d;
    return at / total;
  });
}

export function stageAtMarks(p: number, marks: readonly number[]): number {
  return marks.filter((mark) => p >= mark).length;
}

export function typedBetween(text: string, p: number, from: number, to: number): string {
  return text.slice(0, Math.ceil(text.length * share(p, from, to)));
}
