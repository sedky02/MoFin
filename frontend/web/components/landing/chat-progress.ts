/**
 * The landing demos are driven by scroll, not by a timer. One number from 0 to 1 says how far through
 * the section the visitor has scrolled; these turn it into what a conversation shows. Scrolling faster
 * plays it faster, and scrolling back rewinds it.
 */

// Stage reached as a conversation's progress `q` (0-1) passes each mark.
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
  /** The question as far as it has been typed (only while it is being typed). */
  typed: string;
  /** The answer as far as it has been written. */
  answer: string;
}

/** What a conversation shows at progress `q`: its stage, and how much of the question and answer is typed. */
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

/**
 * For a sequence written as delays between stages (the way the demos were first timed): the point
 * in 0-1 at which each stage begins, with the same proportions as the delays.
 */
export function marksFromDelays(delays: readonly number[]): number[] {
  const total = delays.reduce((sum, d) => sum + d, 0);
  let at = 0;
  return delays.map((d) => {
    at += d;
    return at / total;
  });
}

/** The stage reached at progress `p`: how many of the `marks` it has passed (0 before the first). */
export function stageAtMarks(p: number, marks: readonly number[]): number {
  return marks.filter((mark) => p >= mark).length;
}

/** `text` as far as progress `p` has written it, between `from` and `to`: empty before, whole after. */
export function typedBetween(text: string, p: number, from: number, to: number): string {
  return text.slice(0, Math.ceil(text.length * share(p, from, to)));
}
