import { Coffee, House, Receipt, Tags, Utensils } from 'lucide-react-native';

import { categoryGlyph, categoryTint } from '@/components/categories/category-glyph';

describe('categoryGlyph', () => {
  it('uses the picked icon first', () => {
    expect(categoryGlyph({ name: 'Drinks', icon: 'food' })).toEqual({ kind: 'icon', Icon: Utensils });
  });

  it('keeps an older emoji icon', () => {
    expect(categoryGlyph({ name: 'Drinks', icon: '🍹' })).toEqual({ kind: 'emoji', emoji: '🍹' });
  });

  it('guesses from the name with the picker glyphs, so a guess and a pick look the same', () => {
    expect(categoryGlyph({ name: 'Drinks', icon: null })).toEqual({ kind: 'icon', Icon: Coffee });
    expect(categoryGlyph({ name: 'Rent', icon: null })).toEqual({ kind: 'icon', Icon: House });
  });

  it('falls back to a tag for a category and a receipt for an uncategorized transaction', () => {
    expect(categoryGlyph({ name: 'Misc', icon: null })).toEqual({ kind: 'icon', Icon: Tags });
    expect(categoryGlyph(null, 'Something odd')).toEqual({ kind: 'icon', Icon: Receipt });
    expect(categoryGlyph(null, 'Morning coffee')).toEqual({ kind: 'icon', Icon: Coffee });
  });
});

describe('categoryTint', () => {
  it('adds a low alpha to a hex colour and ignores anything else', () => {
    expect(categoryTint('#0ea5e9')).toBe('#0ea5e922');
    expect(categoryTint(null)).toBeUndefined();
    expect(categoryTint('red')).toBeUndefined();
  });
});
