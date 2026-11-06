import { CURRENCIES } from '@/core/constants';
import { currencyName } from '@/core/currency-names';

export type CurrencyOption = { code: string; name: string; group?: string };

/**
 * The picker's rows (same rules as the web): search matches code or name with code prefixes first;
 * with no search, currencies in use come first under "In use", then "All currencies".
 */
export function currencyOptions(query: string, pinned: string[] = []): CurrencyOption[] {
  const q = query.trim().toLowerCase();
  const all = CURRENCIES.map((code) => ({ code, name: currencyName(code) }));
  if (q) {
    const hits = all.filter((o) => o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q));
    return hits.sort(
      (a, b) => Number(b.code.toLowerCase().startsWith(q)) - Number(a.code.toLowerCase().startsWith(q)),
    );
  }
  const pin = new Set(pinned);
  return [
    ...all.filter((o) => pin.has(o.code)).map((o) => ({ ...o, group: 'In use' })),
    ...all.filter((o) => !pin.has(o.code)).map((o) => ({ ...o, group: pin.size ? 'All currencies' : undefined })),
  ];
}
