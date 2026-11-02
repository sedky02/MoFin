import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const theme = require('../scripts/sync-theme') as typeof import('../scripts/sync-theme');

const webCss = fs.readFileSync(path.resolve(__dirname, '../../web/app/globals.css'), 'utf8');
const tokens = theme.parseWebTokens(webCss);
const hex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

describe('theme tokens derived from the web app', () => {
  it('reads every token the app uses, in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(Object.keys(tokens[scheme]).sort()).toEqual([...theme.TOKENS].sort());
    }
  });

  it('keeps the lime brand palette exactly', () => {
    expect(hex(tokens.light.primary)).toBe('#cbe600');
    expect(hex(tokens.light['primary-foreground'])).toBe('#131313');
    expect(hex(tokens.light.destructive)).toBe('#b91c1c');
    expect(hex(tokens.light.background)).toBe('#fafaf9');
    expect(hex(tokens.dark.primary)).toBe('#d2f000');
    expect(hex(tokens.dark.destructive)).toBe('#ff5c5c');
    expect(hex(tokens.dark.background)).toBe('#050505');
  });

  it('flattens the web\'s translucent dark border and input over the dark card colour', () => {
    // rgba(255,255,255,0.09) and (…,0.12) over #131313
    expect(hex(tokens.dark.border)).toBe('#282828');
    expect(hex(tokens.dark.input)).toBe('#2f2f2f');
  });

  it.each(['light', 'dark'] as const)('converts every %s token to HSL and back within one rgb unit', (scheme) => {
    for (const token of theme.TOKENS) {
      const original = tokens[scheme][token];
      const back = theme.hslTripletToRgb(theme.toHslTriplet(original));
      original.forEach((channel: number, i: number) => {
        expect({ scheme, token, channel: i, delta: Math.abs(channel - back[i]) <= 1 }).toEqual({ scheme, token, channel: i, delta: true });
      });
    }
  });

  it('refuses a colour it cannot read instead of writing a wrong palette', () => {
    expect(() => theme.toRgb('hsl(0 0% 0%)')).toThrow('Unsupported colour');
    expect(() => theme.toRgb('rgba(255, 255, 255, 0.5)')).toThrow('Translucent');
  });

  it('matches the committed files: run `npm run theme:sync` after changing the web tokens', () => {
    const built = theme.build();
    expect(fs.readFileSync(path.resolve(__dirname, '../src/global.css'), 'utf8')).toBe(built.css);
    expect(fs.readFileSync(path.resolve(__dirname, '../src/theme/colors.ts'), 'utf8')).toBe(built.colors);
  });
});
