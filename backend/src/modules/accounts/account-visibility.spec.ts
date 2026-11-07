import {
  accountVisibility,
  readVisibility,
  visibilityOfMetadata,
  withVisibility,
} from './account-visibility';

describe('accountVisibility', () => {
  it.each([
    [
      'visible',
      { maskValue: false, countInTotals: true, showOnDashboard: true },
    ],
    ['masked', { maskValue: true, countInTotals: true, showOnDashboard: true }],
    [
      'private',
      { maskValue: true, countInTotals: false, showOnDashboard: true },
    ],
    [
      'hidden',
      { maskValue: true, countInTotals: false, showOnDashboard: false },
    ],
  ])('%s', (level, effects) => {
    expect(accountVisibility(level)).toEqual(effects);
  });

  it('reads anything unknown as visible, so a bad value never hides money', () => {
    for (const bad of [undefined, null, 'secret', 3, {}]) {
      expect(readVisibility(bad)).toBe('visible');
    }
  });
});

describe('metadata', () => {
  it('reads the owner level from metadata', () => {
    expect(visibilityOfMetadata({ visibility: 'private' })).toBe('private');
    expect(visibilityOfMetadata({})).toBe('visible');
    expect(visibilityOfMetadata(null)).toBe('visible');
  });

  it('sets a level while keeping the other keys, and drops the old flag', () => {
    expect(withVisibility({ a: 1, hideAmount: true }, 'masked')).toEqual({
      a: 1,
      visibility: 'masked',
    });
  });

  it('stores nothing for visible, the default', () => {
    expect(withVisibility({ a: 1, visibility: 'private' }, 'visible')).toEqual({
      a: 1,
    });
  });
});
