import { formatMoney, currencySymbol } from '@/core/format';
import { GOLDEN_MONEY } from '@/core/golden-money';
import { installNumberFormatToParts, partsFromFormatted } from '@/lib/intl-polyfill';

describe('NumberFormat.formatToParts stand-in (Hermes iOS)', () => {
  const proto = Intl.NumberFormat.prototype as unknown as { formatToParts?: unknown };
  const native = proto.formatToParts;

  beforeEach(() => {
    delete proto.formatToParts; // what Hermes on iOS looks like
  });
  afterEach(() => {
    Object.defineProperty(proto, 'formatToParts', { value: native, configurable: true, writable: true });
  });

  it('does nothing when the runtime has formatToParts', () => {
    Object.defineProperty(proto, 'formatToParts', { value: native, configurable: true, writable: true });
    expect(installNumberFormatToParts()).toBe(false);
  });

  it('fails the golden strings without it (this is the bug being fixed)', () => {
    expect(formatMoney('1234.5', 'USD')).toBe('1234.5 USD');
  });

  it.each(GOLDEN_MONEY)('formatMoney(%s, %s, compact=%s) is %s with it installed', (amount, currency, compact, expected) => {
    expect(installNumberFormatToParts()).toBe(true);
    expect(formatMoney(amount, currency, { compact })).toBe(expected);
  });

  it('gives money fields their symbol', () => {
    installNumberFormatToParts();
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('TND')).toBe('TND');
  });

  it('splits sign, currency, spaces and digits', () => {
    expect(partsFromFormatted('-$1,234.50', true)).toEqual([
      { type: 'minusSign', value: '-' },
      { type: 'currency', value: '$' },
      { type: 'integer', value: '1,234.50' },
    ]);
    expect(partsFromFormatted('TND 1,234.500', true).map((p) => p.type)).toEqual(['currency', 'literal', 'integer']);
    expect(partsFromFormatted('1\u202f234,50\u00a0€', true).map((p) => p.type)).toEqual(['integer', 'literal', 'currency']);
  });
});
