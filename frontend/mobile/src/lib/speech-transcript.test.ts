import { addResult, EMPTY_TRANSCRIPT, finalText, textToSend } from '@/lib/speech-transcript';

describe('speech transcript', () => {
  it('replaces the interim with each new interim, and closes it with the final', () => {
    let t = addResult(EMPTY_TRANSCRIPT, 'coffee', false);
    t = addResult(t, 'coffee four', false);
    expect(t).toEqual({ finals: [], interim: 'coffee four' });
    t = addResult(t, 'coffee four fifty', true);
    expect(t).toEqual({ finals: ['coffee four fifty'], interim: '' });
  });

  it('joins later segments onto earlier finals, with the new interim after them', () => {
    let t = addResult(EMPTY_TRANSCRIPT, 'Coffee 4.5', true);
    t = addResult(t, 'and lunch', false);
    expect(finalText(t)).toBe('Coffee 4.5');
    expect(t.interim).toBe('and lunch');
    t = addResult(t, 'and lunch 18', true);
    expect(finalText(t)).toBe('Coffee 4.5 and lunch 18');
  });

  it('ignores empty finals and tidies spacing', () => {
    let t = addResult(EMPTY_TRANSCRIPT, '  rent  ', true);
    t = addResult(t, '   ', true);
    expect(t.finals).toEqual(['rent']);
  });

  it("keeps the last interim when listening ends without a final, so the last words aren't lost", () => {
    let t = addResult(EMPTY_TRANSCRIPT, 'how much', true);
    t = addResult(t, 'on food', false);
    expect(textToSend(t)).toBe('how much on food');
  });
});
