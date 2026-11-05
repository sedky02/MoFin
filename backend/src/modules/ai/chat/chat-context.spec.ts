import { LlmMessage } from '../llm/llm-provider';
import {
  HISTORY_CHAR_BUDGET,
  historyMessages,
  RECENT_MESSAGES,
  SUMMARY_BATCH,
  summaryRange,
  titleFrom,
  TOOL_RESULTS_CHAR_BUDGET,
  trimToolResults,
} from './chat-context';

describe('historyMessages', () => {
  it('sends every message the summary does not cover, oldest first', () => {
    const stored = ['a', 'b', 'c', 'd'].map((content, i) => ({
      role: i % 2 ? ('ASSISTANT' as const) : ('USER' as const),
      content,
    }));
    expect(historyMessages(stored, 1)).toEqual([
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ]);
  });

  it('notes the charts an answer showed', () => {
    const [message] = historyMessages(
      [{ role: 'ASSISTANT', content: 'Here.', chartTitles: ['Spending'] }],
      0,
    );
    expect(message.content).toBe('Here.\n[Charts shown: Spending]');
  });

  it('shortens the oldest messages over the budget, never the newest', () => {
    const long = 'x'.repeat(HISTORY_CHAR_BUDGET);
    const result = historyMessages(
      [
        { role: 'USER', content: long },
        { role: 'USER', content: long },
      ],
      0,
    );
    expect(result[0].content?.endsWith('(shortened)')).toBe(true);
    expect(result[1].content).toBe(long);
  });
});

describe('summaryRange', () => {
  it(`keeps the last ${RECENT_MESSAGES} verbatim and waits for a batch of ${SUMMARY_BATCH}`, () => {
    expect(summaryRange(RECENT_MESSAGES + SUMMARY_BATCH - 1, 0)).toBeNull();
    expect(summaryRange(RECENT_MESSAGES + SUMMARY_BATCH, 0)).toEqual({
      from: 0,
      to: SUMMARY_BATCH,
    });
    expect(summaryRange(20, 10)).toEqual({ from: 10, to: 14 });
    expect(summaryRange(20, 12)).toBeNull();
  });
});

describe('trimToolResults', () => {
  it('drops the oldest results until the round fits, keeping the newest', () => {
    const big = 'y'.repeat(TOOL_RESULTS_CHAR_BUDGET);
    const messages: LlmMessage[] = [
      { role: 'system', content: 's' },
      { role: 'tool', toolCallId: '1', content: big },
      { role: 'tool', toolCallId: '2', content: big },
    ];
    trimToolResults(messages);
    expect(messages[1].content).toContain('Earlier result dropped');
    expect(messages[2].content).toBe(big);
  });

  it('leaves results under the budget alone', () => {
    const messages: LlmMessage[] = [
      { role: 'tool', toolCallId: '1', content: 'small' },
      { role: 'tool', toolCallId: '2', content: 'small' },
    ];
    trimToolResults(messages);
    expect(messages.map((m) => m.content)).toEqual(['small', 'small']);
  });
});

describe('titleFrom', () => {
  it('uses the first line, cut at a word', () => {
    expect(titleFrom('  How much on food?\nand more')).toBe(
      'How much on food?',
    );
    const title = titleFrom(
      'Compare my spending on groceries and restaurants this month with the same month last year',
    );
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });
});
