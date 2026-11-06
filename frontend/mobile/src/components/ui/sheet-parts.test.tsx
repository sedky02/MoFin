import { revealOffset, sheetCap } from '@/components/ui/sheet-parts';

describe('sheet keyboard handling', () => {
  it('keeps a sheet that fits at its own height; caps a taller one to the room above the keyboard', () => {
    // 800 px of room, no keyboard: the cap is the screen cap.
    expect(sheetCap(800, 0)).toBe(800);
    // A 300 px keyboard leaves 500 px: a taller sheet shrinks to that, its body scrolls.
    expect(sheetCap(800, 300)).toBe(500);
    // Never so small the actions can't show.
    expect(sheetCap(400, 380)).toBe(120);
  });

  it('scrolls just enough to show a field below the visible part, with a margin', () => {
    // Viewport 0–300; field at 400–444 → scroll so its bottom + 24 is the viewport bottom.
    expect(revealOffset(400, 44, 0, 300)).toBe(400 + 44 + 24 - 300);
  });

  it('scrolls back up to a field above the visible part', () => {
    expect(revealOffset(50, 44, 200, 300)).toBe(26);
    expect(revealOffset(10, 44, 200, 300)).toBe(0);
  });

  it('leaves the scroll alone when the field already shows', () => {
    expect(revealOffset(100, 44, 0, 300)).toBeNull();
  });
});
