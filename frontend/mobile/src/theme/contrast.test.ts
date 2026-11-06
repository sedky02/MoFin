// WCAG 2.x text contrast (4.5:1) for the token pairs the app renders, in both themes. Tokens are
// generated (npm run theme:sync), so fix a failure in the component class, not colors.ts.
import { COLORS } from '@/theme/colors';

type Tokens = (typeof COLORS)['light'];

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
function over(fg: string, alpha: number, bg: string): string {
  const f = parseInt(fg.replace('#', ''), 16);
  const g = parseInt(bg.replace('#', ''), 16);
  const mix = (s: number) => Math.round(((f >> s) & 255) * alpha + ((g >> s) & 255) * (1 - alpha));
  return `#${[16, 8, 0].map((s) => mix(s).toString(16).padStart(2, '0')).join('')}`;
}

// [text token, surface token]: every pair is body text (4.5:1).
const PAIRS: [keyof Tokens, keyof Tokens][] = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'secondary'],
  ['secondary-foreground', 'secondary'],
  ['primary-foreground', 'primary'],
  ['primary-text', 'background'],
  ['primary-text', 'card'],
  ['accent-foreground', 'accent'],
  ['destructive', 'background'],
  ['destructive', 'card'],
  ['destructive-foreground', 'destructive'],
  ['success', 'background'],
  ['success', 'card'],
  ['warning', 'background'],
  ['warning', 'card'],
];

describe.each(['light', 'dark'] as const)('contrast, %s theme', (scheme) => {
  const c = COLORS[scheme];
  it.each(PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on the destructive button fill is at least 4.5:1', () => {
    // The button is bg-destructive (light) and bg-destructive/60 over the dark card (dark).
    const fill = scheme === 'dark' ? over(c.destructive, 0.6, c.card) : c.destructive;
    expect(contrast('#ffffff', fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(['light', 'dark'] as const)('tinted chips, %s theme', (scheme) => {
  const c = COLORS[scheme];
  it.each([
    ['success', 0.15],
    ['success', 0.1],
  ] as const)('%s text on its %s tint over the card is at least 4.5:1', (token, alpha) => {
    expect(contrast(c[token], over(c[token], alpha, c.card))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c[token], over(c[token], alpha, c.background))).toBeGreaterThanOrEqual(4.5);
  });
  it('warning badges: amber-800 on light (draft-card WARNING_ON_TINT), warning token on dark', () => {
    const text = scheme === 'light' ? '#92400e' : c.warning;
    expect(contrast(text, over(c.warning, 0.15, c.card))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, over(c.warning, 0.15, c.background))).toBeGreaterThanOrEqual(4.5);
  });
  it('destructive text on its 10% tint over the card is at least 4.5:1', () => {
    expect(contrast(c.destructive, over(c.destructive, 0.1, c.card))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('lime surfaces', () => {
  it('the lime fill is not text on white: it needs the olive text/outline treatment', () => {
    // Lime on white fails for text and for a 3:1 UI boundary; the olive primary-text passes both.
    expect(contrast(COLORS.light.primary, '#ffffff')).toBeLessThan(3);
    expect(contrast(COLORS.light['primary-text'], '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('dark text on the lime fill passes in both themes', () => {
    expect(contrast(COLORS.light['primary-foreground'], COLORS.light.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(COLORS.dark['primary-foreground'], COLORS.dark.primary)).toBeGreaterThanOrEqual(4.5);
  });
});
